---
isDraft: false
headline: "CPU Load Average와 리눅스 CPU 스케줄러(CFS → EEVDF) 정리"
subHeadline: "load average가 무엇을 세는지, 코어보다 태스크가 많을 때 커널이 CPU를 어떻게 나누는지"
excerpt: "Load average의 개념과 집계 원리, 코어 수 초과 시 커널의 시분할 동작, 커널 6.6부터 CFS를 대체한 EEVDF와 OS별 적용 현황"
category: "OPS"
publishDate: 2026-10-28
---

## 1. CPU Load Average — 개념과 원리

- **개념**: load 1은 평균적으로 CPU를 원하는 태스크(스레드 단위)[^cpu-performance]가 1개 있다는 뜻이다.

- **원리**: 리눅스 커널이 5초마다 아래 태스크 수를 세서 1분·5분·15분 평균을 낸다.
  - CPU를 점유하고 있는 태스크

  - 실행 큐에서 CPU를 기다리는 태스크

  - I/O 등을 기다리는 태스크

**load는 프로세스가 아니라 스레드 단위로 센다.** 그래서 하나의 프로세스로 실행되더라도 내부적으로 멀티스레드로 동작하면 load 값이 높게 나온다.

### 1-1. 확인 방법

```bash
uptime              # load average (1m / 5m / 15m)
nproc               # CPU 코어 수 — load가 이 값보다 높은지 비교
top -H              # 전체 스레드 보기
top -H -p ${PID}    # 특정 프로세스의 스레드 보기
```

## 2. Load Average가 코어 수를 넘을 때 — 커널 동작

코어 수보다 실행하려는 태스크가 많으면, 커널 스케줄러는 **시분할 방식으로 각 스레드에 짧은 시간씩 번갈아 CPU를 배분**한다.

리눅스의 시분할 스케줄러는 두 가지다.

- **CFS** (Completely Fair Scheduler)

- **EEVDF** (Earliest Eligible Virtual Deadline First)

## 3. CFS와 EEVDF 비교

| 항목 | CFS | EEVDF |
| --- | --- | --- |
| 사용 커널 | 6.6 이전 | 6.6 이후 (CFS를 대체) |
| 선택 기준 | `vruntime`이 가장 작은, 지금까지 가장 덜 실행된 스레드 | 자기 몫보다 CPU를 덜 받은 스레드만 후보로 두고, 그중 가상 데드라인이 가장 빠른 스레드 |
| 지연 제어 | 커널 파라미터 튜닝, 휴리스틱에 의존 | 스케줄러가 직접 후보를 선정하고 최적화 |

EEVDF는 이름 그대로 두 단계로 다음 스레드를 고른다.

1. **Eligible.** 자기 몫보다 CPU를 덜 받은 스레드만 후보로 선정한다.

2. **Earliest Virtual Deadline.** 후보 중 가상 데드라인이 가장 빠른 스레드를 실행한다.

CFS는 공정성 위주의 스케줄링이라 지연을 제어하려면 커널 파라미터 튜닝과 휴리스틱에 기대야 했다. EEVDF는 **스케줄러 자체에서 직접 후보를 선정하고 최적화하는 구조**로 이를 개선했다.

### 3-1. 스케줄러별 OS

| 스케줄러 | OS | 기본 커널 |
| --- | --- | --- |
| CFS | CentOS 7 / RHEL 7 | 3.10 |
| CFS | RHEL 8 / Rocky 8 / Alma 8 | 4.18 |
| CFS | RHEL 9 / Rocky 9 / Alma 9 | 5.14 |
| CFS | Ubuntu 20.04 LTS | 5.4 (HWE 5.15) |
| CFS | Ubuntu 22.04 LTS | 5.15 |
| EEVDF | RHEL 10 / Rocky 10 / Alma 10 | 6.12 |
| EEVDF | Ubuntu 24.04 LTS | 6.8 |
| EEVDF | Ubuntu 26.04 LTS | 7.0 |

> 주의: 스케줄러는 OS 이름이 아니라 실행 중인 커널 버전으로 정해진다[^os-kernel]. 같은 OS라도 커널을 올렸다면 `uname -r`로 다시 확인한다.

## 4. CFS와 EEVDF 실제 예제 — 테스트 시나리오

### 4-1. 실습 환경

| 비교 방식 | 바뀌는 것 | 판단 |
| --- | --- | --- |
| Ubuntu 22.04 기본 커널 vs HWE 커널 | 커널만 | **추천** — 차이를 커널 탓으로 보기 가장 쉽다 |
| Ubuntu 22.04 vs Ubuntu 24.04 | 커널 + 패키지 전체 | 차이의 원인을 스케줄러로 단정하기 어렵다 |
| Rocky 9 vs Rocky 10 | 커널 + 패키지 전체 | 운영 환경이 RHEL 계열일 때 업그레이드 영향 확인용 |

**같은 OS에서 커널만 바꿔야 스케줄러 차이를 볼 수 있다.** 그래서 Ubuntu 22.04 VM 2대를 같은 스펙(vCPU 2개)으로 만들고, 한 대만 HWE 커널(6.8)로 올린다.

```bash
# EEVDF 쪽 VM만: HWE 커널 설치 후 재부팅
sudo apt install --install-recommends linux-generic-hwe-22.04
sudo reboot

# 두 VM 공통: 커널·스케줄러 확인, 도구 설치
uname -r                                   # 5.15.x(CFS) / 6.8.x(EEVDF)
sudo ls /sys/kernel/debug/sched/           # latency_ns → CFS, base_slice_ns → EEVDF
sudo apt install stress-ng sysstat rt-tests nginx wrk
```

> 주의: 5.15 → 6.8 사이에는 스케줄러 말고도 바뀐 것이 많다. 결과에 차이가 있어도 전부 스케줄러 때문이라고 단정하지 않는다.

### 4-2. 시나리오 1 — CPU 점유율은 같은가

한 코어에 nice 0 / nice 5 태스크를 같이 올려, CPU를 나눠 갖는 비율을 본다.

```bash
taskset -c 0 stress-ng --cpu 1 --timeout 60s &
taskset -c 0 nice -n 5 stress-ng --cpu 1 --timeout 60s &
pidstat -u -C stress-ng 5                  # 태스크별 %CPU
```

두 스케줄러 모두 같은 가중치 표를 쓰므로 약 75 : 25로 같게 나와야 한다.

| 지표 | CFS (5.15) | EEVDF (6.8) |
| --- | --- | --- |
| nice 0 %CPU |  |  |
| nice 5 %CPU |  |  |

### 4-3. 시나리오 2 — CPU 경합 중 깨어난 태스크의 대기 시간

코어 수의 2배만큼 CPU 부하를 걸고, 짧게 자주 깨어나는 일반 스레드가 CPU를 받기까지 얼마나 기다리는지 잰다. 두 스케줄러의 차이가 가장 잘 드러날 지점이다.

```bash
stress-ng --cpu $(( $(nproc) * 2 )) --timeout 120s &
sudo cyclictest -m -q -t1 -p0 -i 1000 -D 60   # -p0: 일반(SCHED_OTHER) 스레드
uptime                                        # 측정 중 load도 함께 기록
```

| 지표 | CFS (5.15) | EEVDF (6.8) |
| --- | --- | --- |
| load 1m |  |  |
| cyclictest Avg (µs) |  |  |
| cyclictest Max (µs) |  |  |

load는 두 커널에서 거의 같고, 대기 시간만 다르게 나오는지 확인한다.

### 4-4. 시나리오 3 — CPU 경합 중 웹 서버 응답 시간

시나리오 2와 같은 배경 부하를 걸어 둔 상태에서 Nginx 응답 시간을 잰다. `wrk`는 테스트 VM의 CPU를 쓰지 않도록 다른 서버에서 실행한다.

```bash
# 테스트 VM
stress-ng --cpu $(( $(nproc) * 2 )) --timeout 120s &

# 다른 서버
wrk -t2 -c50 -d60s --latency http://<테스트 VM IP>/
```

| 지표 | CFS (5.15) | EEVDF (6.8) |
| --- | --- | --- |
| Requests/sec |  |  |
| p50 |  |  |
| p99 |  |  |

### 4-5. 기록 규칙

- 시나리오마다 3번씩 돌리고 중간값을 기록한다.

- 시나리오 사이에는 `pgrep stress-ng`로 이전 부하가 끝났는지 확인한다.

- 두 VM은 같은 호스트에서, 다른 작업이 없는 시간에 돌린다.

## 마무리

- load average는 CPU 사용률이 아니라 CPU를 원하는 태스크(스레드) 수의 평균이다.

- load가 코어 수를 넘으면 커널은 시분할로 CPU를 나누고, 그 규칙이 커널 6.6부터 CFS에서 EEVDF로 바뀌었다.

---

**참고자료**

- [Linux Load Averages: Solving the Mystery](https://www.brendangregg.com/blog/2017-08-08/linux-load-averages.html) — load average가 세는 태스크 상태와 집계 방식을 참고했다.

- [An EEVDF CPU scheduler for Linux (LWN)](https://lwn.net/Articles/925371/) — EEVDF의 eligible, 가상 데드라인 개념과 CFS 대비 변경점을 참고했다.

[^cpu-performance]: load는 태스크의 "개수"만 셀 뿐, CPU가 그 태스크를 얼마나 빨리 처리하는지는 반영하지 않는다. 같은 작업이라도 빠른 CPU에서는 태스크가 금방 끝나 대기열에서 빨리 빠지므로 load가 낮게 유지되고, 느린 CPU에서는 오래 남아 load가 높아진다. 스케줄러도 태스크마다 "같은 양의 일"이 아니라 "같은 비율의 CPU 시간"을 나눠줄 뿐이다. 코어 성능은 클럭(GHz)만으로 정해지지 않고 클럭당 처리량(IPC)·캐시·아키텍처도 함께 좌우한다. 그래서 load는 같은 서버의 코어 수(`nproc`)와 비교할 때만 의미가 있고, CPU가 다른 서버끼리 load 숫자를 그대로 비교하면 안 된다.

    **1-1. CPU 간 성능은 스펙에서 무엇을 보고 비교하나** — 클럭(GHz)은 같은 세대끼리만 비교가 된다. 세대(마이크로아키텍처)가 다르면 클럭당 처리량(IPC)이 달라서, 클럭이 낮은 신형 CPU가 클럭이 높은 구형보다 빠른 경우가 흔하다. 스펙에서 볼 항목은 세대/아키텍처(IPC를 좌우), 전 코어 부스트 클럭(서버는 최대 단일 코어 부스트보다 이 값이 중요), 물리 코어 수와 스레드 수(하이퍼스레드는 물리 코어 1개만큼의 성능이 아니고, 클라우드의 vCPU는 보통 하이퍼스레드 1개), L3 캐시 크기 정도다. 다만 스펙만으로는 근사치일 뿐이라, 정확한 비교는 SPEC CPU 같은 공개 벤치마크 점수나 `sysbench`처럼 같은 도구로 직접 측정한 값으로 한다.
[^os-kernel]: OS 버전은 커널 하나가 아니라 커널 + 사용자 영역 패키지(glibc, OpenSSL, systemd 등) + 지원 정책을 묶은 배포판 릴리스 단위다. Ubuntu 22.04도 HWE 커널을 쓰면 24.04의 기본 커널과 같은 6.8(EEVDF)을 쓸 수 있지만, 24.04도 HWE로 더 높은 커널을 받기 때문에 22.04가 24.04보다 높은 커널을 쓰게 되지는 않는다. 보안 측면에서도 커널 숫자가 높다고 취약점이 적은 것은 아니다. 배포판은 지원 기간 동안 보안 수정을 자기 커널 버전에 백포트하므로, 지원 중이고 패치가 적용돼 있느냐가 더 중요하다. 커널을 올려도 사용자 영역 패키지는 22.04 버전 그대로이고, 새 커널에는 새 코드만큼 새 버그도 들어온다. RHEL 계열은 메이저 버전 내내 커널 번호(RHEL 9 = 5.14)를 고정한 채 상위 버전 기능과 수정을 백포트하기 때문에, 번호만으로는 실제 내용을 판단할 수 없다.

    **2-1. 그럼에도 커널 업데이트가 의미 있는 이유** — 커널 업데이트는 두 종류로 나눠 봐야 한다. 같은 버전 안의 패치 업데이트(`apt upgrade`, `dnf update`)는 백포트된 보안·버그 수정을 받는 유일한 통로라서, 지원 기간 안이라도 업데이트와 재부팅(또는 livepatch)을 하지 않으면 취약점은 그대로 남는다. 상위 버전으로 올리는 업데이트(HWE, OS 업그레이드)는 신형 하드웨어 드라이버와 EEVDF, PSI, io_uring 같은 새 기능을 얻기 위한 것이다.

    **2-1-1. OS 업데이트의 종류** — 범위가 큰 것부터 정리하면 다음과 같다.

    - **메이저 버전 업그레이드** (RHEL 9 → 10, Ubuntu 22.04 → 24.04): 커널 계열, glibc, 컴파일러 등 기반이 통째로 바뀐다. 지원 기간이 새로 시작되지만 위험도가 가장 커서 재설치나 전용 도구(`leapp`, `do-release-upgrade`)로 한다.

    - **마이너 버전 업데이트** (RHEL 9.4 → 9.5, Ubuntu 22.04.4 → 22.04.5): 그동안의 패치 묶음에 일부 기능과 하드웨어 지원이 더해진다. 커널 계열은 유지되고 평소처럼 `dnf update` / `apt upgrade`로 따라 올라간다.

    - **HWE 커널 전환** (Ubuntu만): OS는 그대로 두고 커널 계열만 올리는 선택 사항이다. RHEL에는 해당하는 개념이 없다.

    - **패치 업데이트** (RHEL 에라타, Ubuntu USN): 보안·버그 수정. 가장 자주 하는 업데이트이고, 커널 수정은 재부팅해야 반영된다.

    - **라이브 패치** (`kpatch`, Canonical Livepatch): 재부팅 없이 커널의 긴급 보안 수정만 적용한다. 다음 재부팅 때 정식 패치 커널로 바꿔야 한다.

    **2-1-1-1. RHEL 에라타와 Ubuntu USN** — 둘 다 패치를 배포할 때 붙이는 **공지(이름표)** 이고, 업데이트 방식이 따로 있는 것이 아니다. 실제 적용은 평소처럼 `dnf update` / `apt upgrade`로 한다.

    - **RHEL 에라타(Errata)**: Red Hat이 수정 패키지를 낼 때마다 발행하는 공지. 보안(RHSA), 버그(RHBA), 기능 개선(RHEA) 세 종류가 있고, 어떤 CVE를 고쳤는지, 어떤 패키지의 몇 버전에서 고쳐졌는지가 적혀 있다. Rocky는 RLSA, Alma는 ALSA라는 이름으로 같은 공지를 낸다.

    - **Ubuntu USN(Ubuntu Security Notice)**: Ubuntu의 보안 공지. `USN-XXXX-1` 형식이고, 영향받는 릴리스와 패키지, CVE, 수정 버전이 적혀 있다.

    공지 단위로 보면 "전부 업데이트" 대신 필요한 것만 골라 적용할 수 있다. 예를 들어 RHEL 계열은 `dnf updateinfo list --security`로 남은 보안 에라타를 보고 `dnf update --security`로 보안 수정만 적용한다. 같은 `dnf update` 한 번으로 패치 업데이트와 마이너 버전 업데이트가 함께 들어오므로, 둘은 명령어가 아니라 들어오는 내용으로 구분된다.

    **2-2. 커널 업데이트로 성능이 개선되는가** — 개선될 수 있지만 보장되지는 않는다. 스케줄러(EEVDF의 지연 개선), 메모리 관리(6.1의 MGLRU), I/O(io_uring), 네트워크 스택, 신형 CPU 지원처럼 실제로 성능이 좋아지는 변경이 꾸준히 들어온다. 반대로 특정 워크로드에서 성능이 떨어지는 회귀나, CPU 취약점(Spectre 등) 완화 코드처럼 보안을 위해 성능을 깎는 변경도 함께 들어온다. 그래서 "올리면 빨라진다"고 가정하지 말고, 내 워크로드로 업데이트 전후를 측정해 확인해야 한다.
