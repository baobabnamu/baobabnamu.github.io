---
isDraft: true
headline: "AI 스터디 (11월 1주차) - KV Cache가 어떻게 계산되고 추론 엔진이 이를 어떻게 관리하는지 학습"
subHeadline: "attention의 causal mask에서 출발해 vLLM·SGLang의 블록 관리, disaggregated serving, diffusion LLM까지 KV Cache 관점으로 본 LLM 추론"
excerpt: "KV Cache가 정확한 이유와 크기 공식, prefill·decode의 병목 차이, PagedAttention·continuous batching·prefix caching, 그리고 PD 분리와 diffusion LLM에서 달라지는 점을 정리한다."
category: "AI"
publishDate: 2026-11-02
---

LLM 추론의 핵심 자료구조인 KV Cache를 정리한다. 먼저 KV Cache가 무엇이고 어떻게 계산되는지 attention부터 차근차근 보고, 그 다음 vLLM이나 SGLang 같은 추론 엔진이 이 캐시를 어떻게 관리하는지, 마지막으로 클러스터 규모의 disaggregated serving과 KV Cache의 전제가 깨지는 diffusion LLM까지 이어서 본다. 한 줄로 요약하면 **토큰이 하나 생성될 때마다 K와 V가 한 줄씩 쌓인다**는 것이 전부다.

## 1. 왜 KV Cache인가 — 자기회귀 생성과 중복 계산

LLM은 다음 토큰 하나를 예측하는 모델이다. 문장을 만들려면 예측한 토큰을 입력 끝에 붙여 다시 모델에 넣는 과정을 반복한다. 이것이 **자기회귀(autoregressive) 생성**이다.

```text
step 1: [오늘 날씨가]            → LLM → 정말
step 2: [오늘 날씨가 정말]       → LLM → 맑고
step 3: [오늘 날씨가 정말 맑고]  → LLM → 따뜻하다
```

스텝마다 입력이 1씩 길어진다. 그렇다면 step 3에서 모델은 "오늘 날씨가 정말"을 또 처리해야 할까? 캐시가 없으면 그렇다. 매 스텝 입력 전체를 다시 모델에 넣기 때문에 이미 처리한 토큰의 K와 V를 매번 다시 계산한다.

- 프롬프트 4토큰으로 6스텝을 생성하면, 토큰별 K·V 계산 39회 중 **30회(약 77%)가 이미 했던 계산**이다.
- 길이 n까지 생성하면 총 계산량은 `1 + 2 + … + n ≈ n² / 2`로, 생성이 길어질수록 낭비가 제곱으로 커진다.

## 2. Attention과 Q·K·V — 과거는 변하지 않는다

### 2-1. Q·K·V 투영

attention 레이어에 들어온 각 토큰의 hidden state `x_t`(d_model 차원)는 학습된 가중치 행렬 세 개와 곱해져 세 벡터가 된다.

| 벡터 | 계산 | 역할 | 비유 |
| --- | --- | --- | --- |
| q (Query) | `x_t × W_Q` | 지금 토큰이 문맥에서 어떤 정보를 찾는가 | 검색어 |
| k (Key) | `x_t × W_K` | 이 토큰이 무엇을 갖고 있는가. 다른 토큰의 Q와 비교된다 | 문서의 색인 |
| v (Value) | `x_t × W_V` | 선택되었을 때 실제로 전달되는 정보 | 문서 본문 |

이 투영은 **레이어마다, 헤드마다 따로** 일어난다(MHA 기준, GQA/MQA는 KV 헤드를 공유). 이 사실은 뒤의 캐시 크기 공식에 그대로 들어간다.

### 2-2. Attention = 행렬 곱 두 번 + softmax 한 번

```text
Attention(Q, K, V) = softmax(Q·Kᵀ / √d) · V

Q [n×d] × Kᵀ [d×n] = 점수 S [n×n] → softmax → × V [n×d] = 출력 [n×d]
```

- `Q·Kᵀ`: 각 쿼리와 모든 키의 유사도
- `softmax`: 행마다 합이 1인 가중치로 변환
- `× V`: 가중치만큼 Value를 섞는다

### 2-3. Causal mask — 각 토큰은 자신과 과거만 본다

디코더 전용 LLM은 causal mask를 쓴다. i번째 행(i번째 토큰의 쿼리)은 1번부터 i번까지의 키만 볼 수 있고, 미래 칸은 `−∞`로 가린다.

```text
Q ↓ / K →   오늘   날씨가   정말   맑고   따뜻
오늘          ●      −∞      −∞     −∞     −∞
날씨가        ●       ●      −∞     −∞     −∞
정말          ●       ●       ●     −∞     −∞
맑고          ●       ●       ●      ●     −∞
따뜻          ●       ●       ●      ●      ●
```

`−∞`는 softmax를 거치면 가중치 0이 되므로 미래 토큰은 결과에 영향을 주지 못한다. 그래서 **토큰 i의 hidden state와 K·V는 뒤에 어떤 토큰이 오든 바뀌지 않는다.** KV Cache가 근사가 아니라 완전히 같은 결과를 주는 이유가 바로 이것이다.

### 2-4. 핵심 관찰 — 다음 스텝에 새로 필요한 건 마지막 한 행뿐

step t의 attention 행렬과 step t+1의 행렬을 나란히 놓으면 위쪽 t개 행은 완전히 같다. 새로 계산할 것은 맨 아래 행 하나, 즉 새 토큰의 쿼리와 지금까지 모든 키의 내적(`q_(t+1) · [k_1 … k_(t+1)]ᵀ`)뿐이다.

- 새 행을 계산하려면 과거 모든 토큰의 K와 V가 필요하다 → 매번 다시 만들지 말고 저장해 두자. 이것이 **KV Cache**다.
- 과거 토큰의 Q는 다시 쓰이지 않기 때문에 **Q cache라는 것은 없다.**

## 3. KV Cache 계산 — prefill이 채우고, decode가 늘린다

### 3-1. KV Cache를 쓰는 decode 한 스텝

1. **투영**: 새 토큰 1개에 대해서만 `q_t`, `k_t`, `v_t`를 계산한다.
2. **append**: `k_t`, `v_t`를 KV Cache 끝에 붙인다.
3. **attention**: 새 쿼리 하나로 캐시 전체(t개)와 attention을 계산한다. `s = q_t · Kᵀ / √d` (1×t), `o_t = softmax(s) · V`
4. **다음 레이어**: `o_t`가 다음 레이어로 가고, 마지막 레이어 출력으로 다음 토큰을 샘플링한다.

새로 계산하는 K·V는 토큰 1개분이지만, 대신 attention은 매 스텝 캐시 전체를 읽는다.

### 3-2. 코드로 보면 (한 레이어·한 헤드, 단순화)

```python
## Prefill: 프롬프트 X 전체를 한 번에
K_cache = X @ W_K                              # [n, d] n개 토큰의 K
V_cache = X @ W_V                              # [n, d] (attention도 함께 계산)

## Decode: 토큰 하나씩 반복
q, k, v = x_t @ W_Q, x_t @ W_K, x_t @ W_V      # [1, d] 새 토큰 1개만 투영
K_cache = cat([K_cache, k])                    # [t, d] append
V_cache = cat([V_cache, v])                    # [t, d] append
s = q @ K_cache.T / sqrt(d)                    # [1, t] 캐시 전체를 읽음
o = softmax(s) @ V_cache                       # [1, d] 다음 레이어로
```

norm, RoPE, 잔차 연결, MLP는 생략했다. 실제 엔진에서는 이 캐시가 **레이어 수 × KV 헤드 수**만큼 존재하고, 매번 concat하면 복사 비용이 크므로 미리 잡아 둔 메모리 블록에 슬롯 단위로 써 넣는다. 이것이 뒤의 PagedAttention으로 이어진다.

### 3-3. Prefill — 프롬프트 전체로 KV를 채운다

```text
토큰 n개(병렬) → 임베딩
  → 레이어 1: QKV → attn → MLP   ── k·v 쓰기 → KV Cache
  → 레이어 2: QKV → attn → MLP   ── k·v 쓰기 → KV Cache
  → …
  → 레이어 L: QKV → attn → MLP   ── k·v 쓰기 → KV Cache
  → 마지막 위치만 lm_head → 첫 토큰 "정말"
```

- **레이어마다 같은 일**: n개 토큰의 q·k·v를 행렬 곱 한 번에 계산 → k·v를 캐시 블록에 기록 → n×n causal attention → MLP.
- **K·V만 따로 구할 수 없다**: 레이어 l+1의 K·V는 레이어 l의 attention·MLP 출력에서 나오므로 모델 전체를 끝까지 돌려야 한다.
- **끝난 시점의 캐시**: 프롬프트 n개분만 있다. 첫 토큰 "정말"의 K·V는 다음 decode 스텝의 입력으로 들어가면서 추가된다.
- prefix cache hit면 miss 구간만 prefill하고, chunked prefill이면 조각별로 나눠 같은 일을 한다(앞 조각이 채운 캐시를 읽으며 이어 쓴다).

예외 하나: 프롬프트 전체가 prefix 캐시에 hit해도 KV만으로는 다음 토큰의 logits를 얻을 수 없다. 그래서 vLLM은 이 경우 **마지막 토큰 하나를 다시 계산**해 logits를 얻는다.

### 3-4. Decode — 캐시를 읽고 한 줄씩 쓴다

- **입력은 직전 토큰 1개**: 첫 스텝의 입력은 prefill이 낸 첫 토큰이고, 그래서 그 K·V가 이때 처음 캐시에 추가된다.
- **레이어마다 읽고 쓰기**: k·v를 append한 뒤 q 하나로 캐시 전체(n + t개)와 attention을 계산한다.
- **EOS나 최대 길이까지 반복**: 한 스텝 = 토큰 1개. 스텝의 실행·스케줄링 시간이 ITL의 주요 부분이다.

토큰 하나를 위해 매 스텝 **모델 가중치 전체 + KV Cache 전체**를 메모리에서 읽으므로, 계산 대비 메모리 읽기가 압도적으로 많다. 그래서 decode는 대개 memory-bound[^memory-bound]다. 여러 요청을 한 배치로 묶으면 가중치를 한 번 읽어 여러 토큰에 쓸 수 있어 처리량이 크게 오른다. 다만 KV Cache는 요청마다 따로 읽어야 하므로 배치가 커질수록 캐시 읽기의 비중이 커진다.

### 3-5. Prefill과 Decode 한눈에

| 항목 | Prefill | Decode |
| --- | --- | --- |
| 입력 | 프롬프트 토큰 n개를 한꺼번에 | 직전에 생성된 토큰 1개 |
| 연산 형태 | 행렬 × 행렬 (큰 GEMM) | 요청당 벡터 × 행렬, 배치 시 GEMM |
| Attention | n × n causal | 1 × (n + t), 캐시 전체를 읽음 |
| KV Cache | n개분을 새로 기록 | 1개분 append, 전체 읽기 |
| 병목 | 대개 연산 (compute-bound) | 대개 메모리 대역폭 (memory-bound) |
| 배치 효과 | 긴 프롬프트는 단일 요청도 연산 활용도가 높음 | 가중치 읽기를 나눠 써 이득이 크다 |
| 지표 | TTFT | TPOT · ITL |
| 주요 최적화 | prefix caching, chunked prefill | 큰 배치, GQA · FP8 KV, speculative decoding |

이 성격 차이가 뒤에서 볼 disaggregated serving의 출발점이다.

### 3-6. 지연 지표 세 가지 — TTFT · TPOT · ITL

| 지표 | 정의 | 영향 요인 |
| --- | --- | --- |
| TTFT (Time To First Token) | 요청 도착부터 첫 토큰까지. 주로 큐 대기 + prefill | 긴 프롬프트, prefix 캐시 miss면 커진다 |
| TPOT (Time Per Output Token) | 첫 토큰 이후 토큰당 평균 시간 = ITL의 평균 | 가중치·KV 읽기, 배치 크기, 스케줄링 |
| ITL (Inter-Token Latency) | 연속된 두 토큰 사이의 실제 간격 하나하나 | 긴 prefill이 끼어들면 튄다. P99 같은 분포로 본다 |

```text
TPOT = (마지막 토큰 시각 − 첫 토큰 시각) ÷ (출력 토큰 수 − 1)
E2E  = TTFT + TPOT × (N − 1)
```

측정 도구마다 ITL과 TPOT을 섞어 쓰기도 하니 정의를 확인하는 게 좋다. disaggregated serving은 결국 TTFT와 TPOT 목표를 따로 맞추려는 시도다.

### 3-7. K·V 계산량 — n²에서 n으로

- **캐시 없음**: 스텝 t마다 t개 토큰의 K·V를 다시 투영 → 누적 `Σt ≈ n²/2`
- **KV Cache**: 스텝마다 새 토큰 1개만 투영, 나머지는 메모리에서 읽기 → 누적 `n`

단, 새 q와 누적 K·V의 attention은 스텝마다 t에 비례하므로 **attention 누적 비용은 여전히 n²**이다. KV Cache는 연산을 메모리로 바꾼 거래이고, 이제 병목은 메모리 용량과 대역폭이다.

## 4. KV Cache 메모리 — 금세 가중치보다 커진다

### 4-1. 크기 공식

```text
토큰당 KV 크기 = 2(K·V) × L(레이어 수) × H_kv(KV 헤드 수) × d_h(헤드 차원) × bytes(dtype)

예: Llama 3 8B · FP16 (L=32, H_kv=8, d_h=128)
    2 × 32 × 8 × 128 × 2 B = 128 KiB / 토큰
    × 8,192 토큰      = 1 GiB / 요청
    × 동시 요청 32    = 32 GiB
```

- 맨 앞의 2는 K와 V 두 벡터를 저장하기 때문이다. Q는 저장하지 않으므로 3이 아니라 2다.
- 맨 뒤의 2는 FP16 한 값이 2바이트라는 뜻으로, 앞의 2와는 의미가 다르다.
- 비슷한 크기의 Llama 2 7B는 KV 헤드가 32개라 토큰당 **512 KiB로 4배**다. 이 차이는 GQA에서 온다.

### 4-2. 배치가 커지면 KV Cache가 가중치를 넘어선다

Llama 3 8B · FP16 · 요청당 8,192 토큰 기준 GPU 메모리 사용량:

| 항목 | 크기 | 비고 |
| --- | --- | --- |
| 모델 가중치 | 약 15 GiB | 고정 |
| KV · 배치 1 | 1 GiB |  |
| KV · 배치 8 | 8 GiB |  |
| KV · 배치 32 | 32 GiB | 가중치의 2배 |
| KV · 배치 64 | 64 GiB | 80GB GPU 한 장에 가중치와 함께 들어가지 않음 |

GPU 메모리 = 가중치 + KV Cache + 활성값이다. **남은 메모리를 KV Cache에 얼마나 잘 쓰느냐가 동시 처리량을 결정한다.**

### 4-3. KV 헤드를 공유해 캐시를 줄인다 — MHA → GQA → MQA

| 방식 | 구조 (Q 8개 기준) | KV 크기 | 예 |
| --- | --- | --- | --- |
| MHA | Q 헤드마다 자기 K·V (Q 8 : KV 8) | 1× | Llama 2 7B |
| GQA | Q 헤드 여러 개가 한 KV 그룹을 공유 (Q 8 : KV 2) | 1/4 | Llama 3, Mistral, Qwen |
| MQA | 모든 Q 헤드가 K·V 하나를 공유 (Q 8 : KV 1) | 1/8 | PaLM, Falcon |

품질과 메모리의 절충점으로 최근 모델은 대부분 GQA를 쓴다. 그 밖에 KV를 줄이는 방법으로는 다음이 있다.

- **KV 양자화**: FP8 · INT4
- **MLA**: K·V를 저차원 잠재 벡터로 압축 (DeepSeek)
- **Sliding window**: 최근 창만 유지
- **토큰 축출**: StreamingLLM, H2O

## 5. 추론 엔진에서의 KV Cache — 결국 메모리 관리 시스템

### 5-1. 최대 길이만큼 연속 예약하면 단편화로 메모리를 낭비한다

초기 서빙 시스템은 출력 길이를 미리 모르니 요청마다 최대 길이만큼 연속된 메모리를 잡았다.

1. **내부 단편화**: 최대 길이만큼 예약했지만 실제로는 안 쓰이는 공간
2. **외부 단편화**: 요청마다 크기가 달라 사이사이 생기는 쓸 수 없는 틈. 빈 공간을 다 합치면 충분해도 연속된 공간이 없어 새 요청이 대기한다
3. **공유 불가**: 같은 프롬프트라도 요청마다 따로 복사

vLLM 논문(Kwon et al., SOSP 2023)에 따르면 기존 시스템은 KV Cache 메모리의 **20.4–38.2%만** 실제 토큰 저장에 썼다.

### 5-2. PagedAttention — KV Cache를 고정 크기 블록으로 나눈다

OS 가상 메모리와 같은 발상이다. KV Cache를 고정 크기 블록으로 나누고, 요청마다 **block table**로 논리 블록과 물리 블록을 매핑한다. 논리적으로는 연속이지만 물리적으로는 GPU 메모리 어디에 흩어져 있어도 된다.

요청 A(블록 크기 4토큰 예시, vLLM 기본값은 16)의 block table:

| 논리 블록 | 토큰 | 물리 블록 | 채움 |
| --- | --- | --- | --- |
| 0 | 오늘 / 날씨가 / 정말 / 맑고 | #7 | 4/4 |
| 1 | 따뜻 / 하다 / . / 산책 | #1 | 4/4 |
| 2 | 가자 / ! | #3 | 2/4 |

- 블록이 다 차면 빈 블록을 하나 더 받으면 되므로 최대 길이만큼 미리 예약할 필요가 없다.
- 낭비는 **마지막 블록의 빈칸 정도**로 줄어든다.
- attention 커널은 block table을 보고 흩어진 블록에서 K·V를 읽는다.

### 5-3. Continuous batching — 스텝마다 요청이 들어오고 나간다

블록 단위로 메모리를 주고받을 수 있으니 스케줄러가 매 스텝 배치를 다시 짤 수 있다.

- **스텝마다 교체**: 끝난 요청은 바로 빠지고 블록은 free list로 돌아간다 → 대기 요청이 다음 스텝에 합류한다. 배치 전체가 끝나길 기다리는 정적 배칭과 달리 GPU가 놀지 않는다.
- **섞기는 정책 선택**: prefill과 decode를 한 배치에 섞는 것은 별도 스케줄링 정책이다(예: chunked prefill).
- **Preemption**: 블록이 모자라면 일부 요청의 블록을 회수하고, 나중에 재계산하거나 CPU에서 swap-in한다.

### 5-4. Prefix caching — 같은 앞부분은 한 번만 계산한다

세 요청이 같은 시스템 프롬프트로 시작하면, 그 부분의 KV 블록은 한 벌만 두고 세 요청의 block table이 같은 물리 블록을 가리키게 한다(`ref_count = 3`). 각 요청은 자기 질문 부분만 새로 계산한다. 공유 블록에 쓰기가 필요하면 copy-on-write[^cow]로 복사한다.

- **효과**: 공유 부분 prefill 생략 → TTFT 감소, 메모리도 한 벌만
- **잘 맞는 곳**: 멀티턴 대화, 긴 시스템 프롬프트, few-shot, 에이전트
- **구현**: vLLM은 블록 해시(APC), SGLang은 RadixAttention

### 5-5. KV Cache는 어떻게 찾나

**① 요청 안에서 — 검색이 아니라 주소 계산**

```text
토큰 위치 p = 9 ("!")
p // 4 = 2 (논리 블록) · p % 4 = 1 (오프셋)
block_table[2] = #3
→ 물리 블록 #3, 슬롯 1 에서 k·v 읽기
```

O(1) 인덱싱이다. attention 커널이 block table을 받아 흩어진 블록에서 K·V를 직접 모아 읽는다.

**② 요청 사이에서 — prefix 해시 조회**

```text
h0 = hash(∅,  블록0 토큰)  → hit  · #5 공유
h1 = hash(h0, 블록1 토큰)  → hit  · #2 공유
h2 = hash(h1, 블록2 토큰)  → miss · 여기서부터 새로 계산
```

- 해시에 이전 블록의 해시가 체인으로 들어가므로 **앞부분 전체가 같아야 hit**한다. 앞 문맥이 다르면 K·V 값도 다르기 때문에 이것이 정확한 동작이다.
- 꽉 찬 블록만 등록하고, 참조 중이지 않은 블록만 메모리가 필요할 때 LRU로 축출한다.
- SGLang은 radix tree에서 가장 긴 공통 prefix를 매칭한다.

### 5-6. 한 요청의 여정 — KV 블록을 빌리고 돌려준다

```text
요청 도착 → 스케줄링 → 블록 할당 → Prefill → Decode 루프 → 완료
(대기 큐)   (빈 블록     (prefix hit는   (miss 구간   (스텝마다 append,  (블록 반환,
            충분한지)     공유, 나머지    KV 채움 →    블록이 차면       prefix 캐시로
                          새로 할당)      첫 토큰)     하나 더)          남길 수 있음)
```

vLLM 같은 엔진은 세 구성 요소로 이 흐름을 처리한다.

- **Scheduler**: 이번 스텝에 누구를 돌릴지 결정
- **KV Cache Manager**: 블록 풀 · free list · 해시 테이블 · block table 관리, 할당과 해제
- **Model Runner**: block table을 받아 attention 커널이 블록을 읽고 쓴다

### 5-7. 요즘 엔진이 KV Cache로 하는 일

| 기법 | 내용 |
| --- | --- |
| Chunked prefill | 긴 프롬프트를 조각내 decode와 섞어 처리 → 긴 prefill로 인한 decode 지연 증가를 줄인다. 청크 크기로 TTFT와 ITL을 절충 |
| Prefill / Decode 분리 | 성격이 다른 두 단계를 다른 GPU에서 돌리고, 만든 KV Cache를 네트워크로 넘긴다 |
| KV offload · 계층형 캐시 | GPU에서 밀려난 블록을 CPU DRAM · SSD · 원격 저장소에 보관했다가 hit 시 다시 로드 |
| KV 양자화 · 압축 | FP8 KV Cache로 용량 절반 → 같은 GPU에 더 많은 요청과 긴 문맥 |

모두 **KV Cache를 어디에, 얼마나 작게, 얼마나 오래 둘지**의 문제다.

## 6. Disaggregated serving — KV가 클러스터 자원이 된다

### 6-1. 구조 — prefill과 decode를 다른 GPU로

```text
                 KV-aware 라우터 (prefix가 많이 겹치는 노드로 요청 전달)
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       │
 Prefill 풀 (연산 집약)      KV 블록 전송        Decode 풀 (대역폭 집약)
 GPU P1, P2               ── RDMA · NVLink ──▶   D1, D2, D3
 프롬프트 → KV 생성 → 첫 토큰                    받은 KV로 큰 배치 decode
          │                                       │
          └──────── 전역 KV 풀 (CPU DRAM / SSD / 원격 저장소) ────────┘
```

prefill과 decode는 병목이 다르기 때문에 같은 GPU에서 섞으면 서로 방해한다. 그래서 둘을 다른 GPU 풀로 나누고 prefill 노드가 만든 KV 블록을 decode 노드로 넘긴다. 대표적으로 DistServe, Splitwise, Mooncake, NVIDIA Dynamo, llm-d가 있고 vLLM과 SGLang도 KV 전송 커넥터로 지원한다.

단일 엔진에서 본 구조가 그대로 커진다.

- block table → **노드 간 블록 전송**
- prefix 해시 테이블 → **클러스터 전역 인덱스**
- LRU 축출 → **CPU와 SSD로 이어지는 계층형 KV 풀** (Mooncake Store, LMCache 등)

해시 체인 키(`hash(이전 해시, 블록 토큰)`)는 내용 기반이라, 모델 가중치·어댑터·입력 조건이 같다면 어느 노드에서 계산해도 같은 값이 나온다. 그래서 클러스터 공통 키로 쓸 수 있고, vLLM도 해시에 토큰 외에 LoRA ID나 멀티모달 입력 해시를 함께 넣는다. 실제로 전송하려면 dtype과 메모리 레이아웃도 호환되어야 한다. 반면 radix tree는 인스턴스별 구조라, 라우터가 워커별 트리를 근사로 따로 관리하는 식으로 확장한다.

### 6-2. 전송할까, 다시 계산할까 — KV 크기가 곧 네트워크 비용

```text
Llama 3 8B · FP16 · 프롬프트 8,192 토큰
128 KiB × 8,192 = 1 GiB
÷ 50 GB/s (400 Gb/s 링크)
≈ 21 ms / 요청 (이론치)
```

레이어 단위로 계산과 겹치면 체감 지연은 더 줄어든다. 토큰당 전송할 KV 크기를 보면 KV를 줄이는 기법이 그대로 전송량 절감이 된다는 것을 알 수 있다.

| 모델 · 설정 | 토큰당 KV |
| --- | --- |
| Llama 2 7B · MHA · FP16 | 512 KiB |
| Llama 3 8B · GQA · FP16 | 128 KiB |
| Llama 3 8B · GQA · FP8 KV | 64 KiB |

MHA에서 GQA, 다시 FP8로 가면 1/8이 된다. DeepSeek 계열이 MLA와 PD 분리를 함께 쓰는 이유이기도 하다.

- **분리가 유리할 때**: 긴 프롬프트, 엄격한 TTFT·TPOT 목표, 큰 클러스터
- **불리할 때**: 짧은 프롬프트, 작은 규모. 노드 비율 조정, prefill·decode의 텐서 병렬 크기가 달라 생기는 KV 레이아웃 변환 같은 운영 복잡도가 이득보다 클 수 있다

## 7. Diffusion LLM — causal mask가 사라지면

### 7-1. K·V가 매 스텝 바뀐다

LLaDA, Dream, Mercury, Gemini Diffusion 같은 masked diffusion LLM은 응답 길이만큼 MASK로 채워 놓고, 양방향 attention으로 전체를 보면서 확신이 높은 위치부터 여러 토큰을 동시에 채운다.

```text
step 0: [MASK] [MASK]  [MASK] [MASK] [MASK]
step 1: [MASK] 날씨가  [MASK] [MASK] 따뜻하다
step 2: 오늘   날씨가  [MASK] 맑고   따뜻하다
step 3: 오늘   날씨가  정말   맑고   따뜻하다
```

| 구분 | attention | K·V |
| --- | --- | --- |
| AR (causal) | 과거만 본다 | 고정 |
| Diffusion (양방향) | 모두가 모두를 본다 | 계속 변함 |

한 칸이 MASK에서 실제 토큰으로 바뀔 때마다 그 칸을 보는 모든 토큰의 hidden state와 K·V가 달라진다. 그래서 AR처럼 과거 KV 전체를 그대로 정확하게 재사용하기 어렵고, 순수하게 하면 매 스텝 전체를 다시 계산한다. **병목도 메모리 대역폭에서 연산 쪽으로** 옮겨 간다.

### 7-2. 그래도 KV Cache는 다시 돌아온다 — 근사 캐시와 블록 diffusion

| 방식 | 아이디어 | 캐시 성격 |
| --- | --- | --- |
| 순수 diffusion | 프롬프트까지 포함해 매 스텝 전체를 다시 계산 | 캐시 없음, 재계산 비용이 큼 |
| 근사 KV Cache | 프롬프트·확정 토큰의 K·V는 스텝 사이에 거의 안 변한다 → 캐시하고 가끔만 갱신 | 근사 (Fast-dLLM, dKV-Cache, dLLM-Cache 등) |
| 블록 diffusion | 블록 사이는 causal, 블록 안은 diffusion → 끝난 블록의 K·V는 고정 | 블록 단위로 정확 (BD3-LM 등) |

결국 **과거가 고정되면 캐시할 수 있다**는 원리가 여기서도 설계 기준이 된다. 서빙 관점에서는 페이징과 스텝 단위 스케줄링 원리를 그대로 활용할 수 있다. vLLM도 speculative decoding에서 여러 토큰을 한 번에 검증하니 이 원리가 한 토큰 생성에만 묶인 것은 아니다. 다만 diffusion의 반복 갱신과 병렬 토큰 생성에 맞는 스케줄링과 캐시 관리는 아직 열려 있는 문제다. 여기 소개한 모델과 기법 이름은 2026년 중반 기준이다.

## 마무리

- causal mask 덕분에 과거 토큰의 K·V는 변하지 않는다 → 저장해서 재사용한다(Q는 저장하지 않는다).
- Prefill이 캐시를 채우고, decode는 캐시 전체를 읽으며 한 줄씩 늘린다.
- 크기 = `2 × 레이어 × KV 헤드 × 헤드 차원 × 바이트 × 토큰 수`. 배치와 문맥이 커지면 금세 가중치보다 커진다.
- 그래서 vLLM, SGLang 같은 추론 엔진의 핵심은 KV 메모리 관리다: 페이징 · continuous batching · prefix 캐싱.
- Disaggregated serving은 KV를 클러스터 자원으로 옮기고, diffusion LLM은 근사 재사용 또는 블록 구조를 통한 정확한 재사용을 활용한다.

### 예상 질문

- **Q. 왜 Q cache는 없나?** 다음 스텝에서 새로 계산하는 것은 새 토큰의 쿼리 한 행뿐이고, 과거 토큰의 쿼리는 다시 쓰이지 않는다. 그래서 크기 공식의 계수도 3이 아니라 2다.
- **Q. KV Cache를 쓰면 결과가 조금 달라지지 않나?** causal mask 때문에 과거 토큰의 K·V는 뒤 토큰과 무관하게 고정이므로, 캐시를 써도 수학적으로 같은 결과다. 근사가 되는 것은 diffusion LLM의 근사 캐시처럼 이 전제가 깨질 때다.
- **Q. 프롬프트 전체가 prefix 캐시에 hit하면 prefill은 0인가?** 거의 0이지만, KV만으로는 다음 토큰의 logits를 얻을 수 없어 마지막 토큰 하나는 다시 계산한다.
- **Q. decode가 느린데 GPU 연산 성능을 올리면 해결되나?** decode는 대개 가중치와 KV를 읽는 시간이 지배적인 memory-bound라, 배치를 키우거나 GQA · FP8 KV로 읽을 양을 줄이는 쪽이 더 효과적이다.

---

**참고자료**

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762) — Q·K·V와 attention의 출발점 (Vaswani et al., NeurIPS 2017)
- [Fast Transformer Decoding: One Write-Head is All You Need](https://arxiv.org/abs/1911.02150) — MQA, K·V 헤드를 하나로 공유 (Shazeer, 2019)
- [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints](https://arxiv.org/abs/2305.13245) — Q 헤드 그룹이 KV 헤드를 공유 (Ainslie et al., EMNLP 2023)
- [DeepSeek-V2](https://arxiv.org/abs/2405.04434) — MLA, K·V를 저차원 잠재 벡터로 압축 (DeepSeek-AI, 2024)
- [Efficient Streaming Language Models with Attention Sinks](https://arxiv.org/abs/2309.17453) — StreamingLLM, 앞 토큰 몇 개와 최근 창만 유지 (Xiao et al., ICLR 2024)
- [H2O: Heavy-Hitter Oracle](https://arxiv.org/abs/2306.14048) — attention을 많이 받는 토큰만 캐시에 남김 (Zhang et al., NeurIPS 2023)
- [Orca: A Distributed Serving System for Transformer-Based Generative Models](https://www.usenix.org/conference/osdi22/presentation/yu) — 스텝 단위 스케줄링 (Yu et al., OSDI 2022)
- [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180) — vLLM, 블록 단위 KV 관리로 단편화 제거 (Kwon et al., SOSP 2023)
- [SGLang: Efficient Execution of Structured Language Model Programs](https://arxiv.org/abs/2312.07104) — RadixAttention, radix tree로 요청 간 prefix 재사용 (Zheng et al., NeurIPS 2024)
- [Sarathi-Serve](https://arxiv.org/abs/2403.02310) — chunked prefill, prefill을 쪼개 decode와 섞기 (Agrawal et al., OSDI 2024)
- [DistServe](https://arxiv.org/abs/2401.09670) — prefill·decode를 다른 GPU로 분리 (Zhong et al., OSDI 2024)
- [Splitwise](https://arxiv.org/abs/2311.18677) — 단계별로 다른 하드웨어에 배치 (Patel et al., ISCA 2024)
- [Mooncake: A KVCache-centric Disaggregated Architecture for LLM Serving](https://arxiv.org/abs/2407.00079) — Kimi의 PD 분리 + CPU·SSD KV 풀 (Qin et al., 2024)
- [Large Language Diffusion Models](https://arxiv.org/abs/2502.09992) — LLaDA, 8B masked diffusion LLM (Nie et al., 2025)
- [Block Diffusion](https://arxiv.org/abs/2503.09573) — BD3-LM, 블록 사이 AR · 블록 안 diffusion (Arriola et al., ICLR 2025)
- [Fast-dLLM](https://arxiv.org/abs/2505.22618) — 블록 단위 근사 KV Cache + 병렬 디코딩 (Wu et al., 2025)
- [dKV-Cache: The Cache for Diffusion Language Models](https://arxiv.org/abs/2505.15781) — 확정된 토큰을 한 스텝 늦게 캐시 (Ma et al., 2025)
- [dLLM-Cache](https://arxiv.org/abs/2506.06295) — 프롬프트·응답을 다른 주기로 갱신 (2025)

[^memory-bound]: 연산 유닛이 일을 기다리는 시간보다 메모리에서 데이터를 가져오는 시간이 더 길어 성능이 메모리 대역폭에 묶이는 상태를 말한다. decode는 토큰 하나를 만들 때 곱셈 횟수는 적은데 가중치 수 GB와 KV Cache 전체를 매번 읽어야 해서 대표적인 memory-bound 작업이다. 반대로 prefill처럼 같은 데이터로 많은 연산을 하는 작업은 compute-bound가 된다.
[^cow]: copy-on-write는 여러 요청이 같은 물리 블록을 읽기 전용으로 공유하다가, 누군가 그 블록에 쓰려는 순간에만 복사본을 만들어 주는 방식이다. OS의 fork와 같은 원리로, 공유 prefix처럼 대부분 읽기만 하는 데이터를 메모리 한 벌로 처리할 수 있게 해 준다.
