---
isDraft: true
headline: "Kubernetes 스터디 (11월 1주차) - 운영에 필요한 생태계 도구를 영역별로 정리하며 플랫폼 엔지니어링 관점 학습"
subHeadline: "Pod·Deployment·Service 다음에 무엇을 알아야 하는지, 보안·배포·관측·네트워크·확장·복구 영역별 도구 지도"
excerpt: "Kubernetes는 하나의 도구가 아니라 생태계라는 관점에서, 운영 환경에 필요한 대표 도구를 영역별로 묶어 역할과 함께 정리한다."
category: "OPS"
publishDate: 2026-11-02
---

Kubernetes를 처음 배울 때는 Pod, Deployment, Service만 익히면 충분하다고 생각하기 쉽다. 그런데 실제 운영 환경에 들어가 보면 Kubernetes는 더 큰 그림의 **중심**일 뿐이고, 애플리케이션을 규모 있게 돌리려면 오케스트레이션 외에 보안·배포·관측·네트워크·확장·복구를 맡는 도구들이 함께 필요하다. 이 글은 LinkedIn에 공유된 "Kubernetes는 도구가 아니라 생태계다"라는 글과 생태계 지도를 바탕으로, 각 도구가 어떤 문제를 푸는지 영역별로 정리한 것이다.

## 1. 전체 그림 — Kubernetes를 중심으로 붙는 도구들

```text
                 보안            배포            관측
          Trivy·Falco·Kyverno  Helm·Kustomize  Prometheus·Grafana
          cert-manager         Argo CD·Flux    Fluent Bit·Loki·OTel
                        \           |           /
                         \          |          /
   확장  KEDA·Karpenter ──  [ Kubernetes ]  ── 네트워크  Calico·Cilium
                         /          |          \         Istio·Envoy Gateway
                        /           |           \
          복구·스토리지          런타임·기반
          Velero·Longhorn        containerd·CRI-O·CoreDNS
```

원문의 결론은 한 줄이다. **Kubernetes를 배우는 것은 좋은 출발이고, 그 생태계를 이해하는 것이 엔지니어를 플랫폼 엔지니어로 만든다.** Kubernetes 자체보다, 전문화된 도구들을 조합해 안전하고 관측 가능하며 복원력 있는 자동화 플랫폼을 만들 수 있다는 점이 핵심이라는 것이다.

## 2. 영역별 도구 정리

### 2-1. 보안 — 이미지, 런타임, 정책, 인증서

| 도구 | 하는 일 |
| --- | --- |
| Trivy | 컨테이너 이미지·IaC·매니페스트의 취약점과 잘못된 설정을 스캔 |
| Falco | 컨테이너 런타임에서 의심스러운 동작(예: 컨테이너 안 셸 실행)을 탐지 |
| Kyverno | 클러스터에 들어오는 리소스에 정책을 강제 (예: latest 태그 금지, 리소스 제한 필수) |
| cert-manager | TLS 인증서 발급과 갱신을 자동화 |

배포 전(Trivy) → 배포 시점(Kyverno) → 실행 중(Falco)으로 **단계마다 다른 도구가 지킨다**고 보면 정리가 쉽다.

### 2-2. 배포 — 패키징과 GitOps

| 도구 | 하는 일 |
| --- | --- |
| Helm | 매니페스트를 템플릿과 values로 묶은 차트 단위 패키징 |
| Kustomize | 템플릿 없이 base에 환경별 overlay를 덧붙이는 방식 |
| Argo CD | Git 저장소의 상태를 클러스터에 맞춰 주는 GitOps 도구, UI 중심 |
| Flux | 같은 GitOps 도구, 컨트롤러 조합 중심 |

GitOps[^gitops]를 쓰면 "누가 언제 무엇을 바꿨는지"가 Git 기록으로 남고, 손으로 바꾼 설정은 자동으로 원래대로 돌아간다.

### 2-3. 관측 — 메트릭, 로그, 트레이스

| 도구 | 하는 일 |
| --- | --- |
| Prometheus | 메트릭 수집과 저장, 알림 규칙 |
| Grafana | 메트릭·로그를 대시보드로 시각화 |
| Fluent Bit | 노드에서 로그를 모아 원하는 곳으로 전달하는 경량 수집기 |
| Loki | 레이블 기반으로 로그를 저장·검색 |
| OpenTelemetry (OTel) | 메트릭·로그·트레이스를 표준 형식으로 수집하는 규격과 도구 모음 |

### 2-4. 네트워크 — CNI, 서비스 메시, 게이트웨이, DNS

| 도구 | 하는 일 |
| --- | --- |
| Calico | Pod 네트워크(CNI)와 NetworkPolicy 기반 통신 제어 |
| Cilium | eBPF 기반 CNI, 네트워크 정책과 관측까지 제공 |
| Istio | 서비스 메시 — 서비스 간 트래픽 라우팅, mTLS, 재시도 등 |
| Envoy Gateway | Gateway API 기반으로 외부 트래픽을 클러스터로 들여오는 게이트웨이 |
| CoreDNS | 클러스터 내부 DNS, 서비스 이름을 IP로 해석 |

### 2-5. 확장 — 이벤트와 노드

| 도구 | 하는 일 |
| --- | --- |
| KEDA | 큐 길이·이벤트 수 같은 외부 지표로 워크로드를 스케일 (0까지 축소 가능) |
| Karpenter | 스케줄되지 못한 Pod를 보고 필요한 노드를 바로 프로비저닝 |

KEDA는 **Pod 수**를, Karpenter는 **노드 수**를 늘린다. 둘을 함께 쓰면 부하가 늘 때 Pod가 먼저 늘고, 자리가 부족하면 노드가 따라 늘어난다.

### 2-6. 복구와 스토리지

| 도구 | 하는 일 |
| --- | --- |
| Velero | 클러스터 리소스와 볼륨을 백업·복원, 클러스터 이전에도 사용 |
| Longhorn | 노드 디스크를 묶어 복제되는 분산 블록 스토리지 제공 |

### 2-7. 런타임 — 보이지 않는 기반

| 도구 | 하는 일 |
| --- | --- |
| containerd | 컨테이너를 실제로 실행하는 런타임 (kubelet이 CRI[^cri]로 호출) |
| CRI-O | Kubernetes 전용으로 만든 경량 컨테이너 런타임 |

원문 본문에는 없지만 생태계 지도에 함께 있던 도구다. 평소에는 의식하지 않지만 장애 분석 때는 이 계층까지 내려가야 할 때가 있다.

## 3. 정리하며 든 생각 — 도구보다 "어떤 문제를 푸는가"

도구 이름을 외우기보다 **영역(문제) → 대표 도구** 순서로 머릿속에 지도를 그리는 게 낫다. 같은 영역 안에서도 Argo CD와 Flux, Calico와 Cilium처럼 선택지가 갈리므로, 처음에는 영역마다 하나씩만 직접 써 보고 차이는 필요해질 때 비교하면 된다.

직접 학습한다면 다음 순서가 무난하다.

1. **배포**: Helm 차트로 앱을 올리고, Argo CD로 Git과 연결한다.
2. **관측**: Prometheus + Grafana로 메트릭을, Fluent Bit + Loki로 로그를 본다.
3. **보안**: Trivy로 이미지를 스캔하고 Kyverno 정책 하나를 걸어 본다.
4. **확장·복구**: KEDA로 이벤트 기반 스케일을 해 보고, Velero로 백업·복원을 한 번 돌려 본다.

## 마무리

- Kubernetes는 오케스트레이터이고, 운영에 필요한 나머지는 생태계 도구가 채운다.
- 영역은 크게 보안, 배포, 관측, 네트워크, 확장, 복구·스토리지, 런타임으로 나눌 수 있다.
- 플랫폼 엔지니어의 역량은 도구를 많이 아는 것보다, 문제마다 어떤 도구를 어떻게 조합할지 판단하는 데서 나온다.

### 예상 질문

- **Q. 이 도구를 전부 써야 하나?** 아니다. 클러스터 규모와 요구 사항에 따라 필요한 영역만 고른다. 작은 환경이라면 Helm, Prometheus + Grafana, 백업 도구 정도로도 충분하다.
- **Q. Helm과 Kustomize, Argo CD와 Flux 중 무엇을 골라야 하나?** 같은 문제를 다른 방식으로 푼다. 팀이 이미 쓰는 쪽이나 문서·예제가 많은 쪽으로 시작하고, 함께 쓰는 경우(Argo CD로 Helm 차트 배포)도 흔하다.
- **Q. Istio 같은 서비스 메시는 꼭 필요한가?** 서비스 수가 많고 mTLS, 세밀한 트래픽 제어가 필요할 때 가치가 크다. 그렇지 않으면 운영 복잡도가 이득보다 클 수 있다.

---

**참고자료**

- 원문: "Kubernetes is not a tool. It's an ecosystem." (LinkedIn 글과 Kubernetes Ecosystem 지도) — 영역 구분과 도구 목록, 플랫폼 엔지니어 관점을 참고했다.
- [CNCF Cloud Native Landscape](https://landscape.cncf.io/) — 클라우드 네이티브 도구를 영역별로 정리한 전체 지도.

[^gitops]: GitOps는 클러스터에 적용할 설정을 Git 저장소에 두고, 클러스터 안의 컨트롤러가 저장소와 실제 상태를 계속 비교해 맞추는 운영 방식이다. 배포는 kubectl 명령 대신 Git 커밋과 리뷰로 이뤄지고, 되돌리기도 커밋을 되돌리는 것으로 끝난다.
[^cri]: CRI(Container Runtime Interface)는 kubelet이 컨테이너 런타임과 통신할 때 쓰는 표준 인터페이스다. 이 규격 덕분에 kubelet 입장에서는 containerd든 CRI-O든 같은 방식으로 컨테이너를 만들고 지울 수 있다.
