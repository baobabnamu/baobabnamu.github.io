---
title: '피크 트래픽에 뻗은 리버스 프록시 — CPU·네트워크 스택 튜닝 발표 자료'
description: '라이브 프로모션 트래픽 급증으로 발생한 Nginx 504 장애를 CPU governor, IRQ 분산, NIC 큐, TCP 스택 레벨에서 되짚은 서버 엔지니어 관점의 케이스 스터디'
pubDate: '2026-10-25'
tags: ['performance', 'linux', 'infra', 'networking']
draft: false
---
## 시나리오

- **목적**: "애플리케이션은 정상인데 느리다"는 증상에서, OS·네트워크 스택 레벨의
진짜 원인까지 도달하는 과정을 재현 가능한 절차로 공유
- **상황 요약**: CPU governor가 절전 모드로 고정돼 있었고, NIC 인터럽트가 코어 하나에만 몰려 있던 상태에서 트래픽이 급증하자 패킷이 드롭되기 시작했다. 백엔드  
애플리케이션 코드는 처음부터 끝까지 정상이었다.

```text
측정(Measure) → 병목 특정(Identify) → 튜닝(Tune) → 검증(Verify) → (반복)
```

이 루프를 돌리는 동안 **한 번에 하나만 바꾸고, 전후를 비교한다**는 원칙을 지킨다.

## 1. 배경 — 인프라 구성과 장애 타임라인

```text
Client → ALB
           │
   ┌───────┼───────┬───────┐
   ▼       ▼       ▼       ▼
 Proxy#1 Proxy#2 Proxy#3 Proxy#4
   │       │       │       │
   └───────┴───┬───┴───────┘
               ▼
             WAS
```

리버스 프록시 4대는 Nginx(EC2 c5.xlarge, Enhanced Networking)이고, WAS
티어는 이번 장애와 무관하다 — 아래 배제 과정에서 정상임을 확인한다.

- 리버스 프록시 4대가 WAS 앞단에서 TLS 종료 + 라우팅을 담당
- 평소 평균 동시 접속 2,000, 피크(라이브 프로모션 방송) 때 12,000까지 급증 예정이었음
- 인스턴스는 생성된 지 오래된 AMI 기반이라 CPU governor[^governor]가 기본값인
  `powersave`로 남아 있었고, `irqbalance`는 설치돼 있었지만 비활성 상태였다
  (이 두 가지가 원인이라는 건 이때는 아무도 몰랐다)

### 장애 타임라인


| 시각    | 현상                                                        | 당시 판단                |
| ----- | --------------------------------------------------------- | -------------------- |
| 20:00 | 라이브 방송 시작, 동시 접속 2,000 → 9,000 급증                         | "트래픽 몰려서 그런가" 정도로 관찰 |
| 20:04 | Nginx 로그에 `connect() failed (111: Connection refused)` 다수 | WAS 쪽 문제로 의심         |
| 20:06 | WAS 쪽 CPU/메모리/응답시간 모두 정상 확인                               | "그럼 어디가 문제지?"        |
| 20:12 | 클라이언트 504 비율 0.1% → 4%, Slack 알림 발생                       | 온콜 엔지니어 투입           |


핵심 단서는 **WAS 티어는 끝까지 정상이었다**는 점이다. 애플리케이션을 의심할 이유가
없었고, 그렇다면 남은 건 프록시 서버의 OS/네트워크 스택이었다.

## 2. 접근 원칙 — "애플리케이션은 죄가 없다"를 증명한 다음

왜 WAS부터 봤는지(네트워크/OS를 먼저 의심하지 않고) 기준이 두 가지 있었다.

1. **에러 메시지 자체가 단서였다.** `connect() failed (111: Connection refused)`는
   "느려서" 나는 에러(504 타임아웃)가 아니라 "연결 자체가 거부됐다"는 신호다.
   처리가 느린 것과 연결을 거부당하는 것은 원인이 다른 카테고리라서, 이 로그를
   본 순간 "WAS가 응답을 안 하고 있거나, 둘 사이 어딘가서 연결이 막히고 있다"는
   두 가지 가능성으로 범위가 좁혀졌다.
2. **확인 비용이 가장 싼 곳부터 본다.** WAS는 이미 CPU/메모리/응답시간 대시보드가
   있어서 들여다보는 데 1분이 안 걸린다. 반면 OS/네트워크 스택 조사는 서버에
   직접 들어가 명령어를 여러 개 돌려야 해서 상대적으로 비용이 크다. 그러니
   싸고 빠르게 배제할 수 있는 쪽(WAS)부터 먼저 지워서, 비용이 큰 조사(OS/네트워크)
   범위를 최소화하는 순서를 택했다.

요청이 지나가는 경로(Client → Nginx → WAS → DB)를 따라가며 구간별 자체 지표를
하나씩 확인해 "여기까지는 정상, 여기서부터 이상"인 경계를 찾는 방식이라고 보면
된다. 이번엔 WAS 자체 지표가 정상이었으니, 경계가 "Nginx ↔ WAS 사이 또는 Nginx가
올라가 있는 OS" 쪽으로 좁혀졌다.

백엔드가 정상이라는 걸 먼저 확인했기 때문에, 이번엔 CPU·메모리·디스크·네트워크 네
자원 중 네트워크와 CPU(특히 인터럽트 처리)에 집중해서 측정했다. 성능 문제를
한 문장으로 쪼개면 이렇게 된다.

```text
Total Response Time = CPU Time + Memory Access Time
                     + Disk I/O Time + Network Time
                     + Lock Wait Time + Queue Time
```

가장 큰 값부터 줄이는 것이 원칙이고, 이번 사례에서는 CPU Time(인터럽트 처리) +
Network Time(패킷 드롭/재전송)이 압도적으로 컸다.

## 3. 측정 — 프록시 서버에서 순서대로 확인

```bash
top -d 1                  # sy(system) 비율, 코어별 편중 여부
mpstat -P ALL 1 3          # 코어별 사용률 — 특정 코어만 튀는지 확인
vmstat 1 5                  # cs(context switch) 추세
dmesg -T | tail -50         # conntrack, NIC, 하드웨어 관련 커널 로그
cat /proc/interrupts        # IRQ가 어느 코어에 몰려 있는지
ethtool -S eth0             # rx_dropped, rx_missed_errors 등 드라이버 카운터
ethtool -g eth0              # ring buffer 크기
cpupower frequency-info      # CPU governor 상태
sar -n DEV 1 5                # NIC 트래픽/드롭 추세
ss -s                          # 소켓 상태, TIME_WAIT 수
iostat -xz 1 5                  # 대조군 — 디스크는 정상임을 확인
```

### 3-1. CPU — 코어 하나만 타버린 패턴

```bash
mpstat -P ALL 1 3
```

```text
CPU    %usr   %nice    %sys  %iowait   %irq  %soft   %idle
all    18.2     0.0    22.4      0.3    0.0   9.1    50.0
  0    12.0     0.0    71.5      0.2    0.0  14.1     2.2
  1    19.4     0.0     8.1      0.3    0.0   6.0    66.2
  2    20.1     0.0     7.6      0.4    0.0   5.8    66.1
  3    21.3     0.0     7.0      0.3    0.0   5.9    65.5
```

CPU0만 `%sys`가 71.5%로 튀고 나머지 코어는 한가하다. `top` 전체 평균 CPU
사용률(약 50%)만 봤다면 "여유 있다"고 오판했을 상황이다 — **코어별 분포를 보지
않으면 이 병목은 보이지 않는다.**

```bash
cat /proc/interrupts | grep eth0
```

```text
 45:  812340312          0          0          0   PCI-MSI-edge      eth0-TxRx-0
```

여러 NIC가 CPU0에 몰렸다는 뜻이 아니다. NIC(eth0)는 1개고, 문제는 그 NIC가
**큐를 1개(`TxRx-0`)만 쓰고 있었다**는 점이다. NIC에 큐가 여러 개 있으면
큐마다 별도 IRQ[^irq]로 나뉘어 코어마다 하나씩 나눠 처리할 수 있는데(Receive
Side Scaling, RSS), 큐가 1개뿐이면 그 NIC로 들어오는 모든 트래픽의 인터럽트가
애초에 IRQ 45 하나로만 모인다. 거기에 `irqbalance`까지 꺼져 있어서 IRQ 45가
CPU0 하나에만 고정 배정된 상태였고, 그 결과 이 NIC가 만드는 인터럽트 전부를
CPU0 혼자 처리하고 있었다.

```bash
cpupower frequency-info
```

```text
analyzing CPU 0:
  current policy: frequency should be within 1.20 GHz and 3.00 GHz.
  The governor "powersave" may decide which speed to use within this range.
  current CPU frequency: 1.35 GHz
```

governor가 `powersave`라 평소엔 절전을 위해 낮은 주파수[^frequency]로
동작하다가, 트래픽이 급증한 순간에도 주파수가 즉시 따라 올라가지 못해 CPU0의
인터럽트 처리가 더 쉽게 포화됐다.

### 3-2. 네트워크 — 패킷이 실제로 버려지고 있었다

```bash
ethtool -S eth0 | grep -E 'drop|missed|error'
```

```text
     rx_dropped: 184032
     rx_missed_errors: 91210
     rx_fifo_errors: 91210
```

```bash
ethtool -g eth0
```

```text
Ring parameters for eth0:
Pre-set maximums:
RX:             8192
Current hardware settings:
RX:              256
```

기본 RX ring buffer[^ring-buffer]가 256으로, 트래픽 급증 구간에서 큐가
순식간에 가득 차 `rx_dropped`가 18만 건 넘게 쌓였다.

```bash
dmesg -T | grep -i conntrack
```

```text
[Mon Oct 25 20:05:41] nf_conntrack: table full, dropping packet
```

동시 접속이 급증하면서 conntrack[^conntrack] 테이블까지 가득 찼고, 신규 연결 수립 자체가
커널 단에서 drop되고 있었다. 이 시나리오의 트래픽은 전부 HTTP(S), 즉 TCP
연결이다 — 클라이언트가 새로 보내는 TCP SYN 패킷마다 conntrack이 항목을 새로
만들어야 하는데, 표가 꽉 차 있으니 그 SYN 패킷 자체를 커널이 버린 것이다.
이미 맺어져 있던 기존 연결(기존 conntrack 항목이 있는 연결)은 영향받지 않고,
"새로 연결을 맺으려는 시도"만 이렇게 막혔다.

```bash
sar -n DEV 1 5
```

```text
IFACE   rxpck/s   txpck/s   rxkB/s   txkB/s   rxdrop/s
eth0     48210      46012    61230     58012     2840
```

### 3-3. 대조군 — 디스크는 정상이었다

```bash
iostat -xz 1 5
```

```text
Device            r/s     w/s   await  aqu-sz  %util
nvme0n1           4.0    12.0    0.80    0.05    3.00
```

`await`, `aqu-sz`, `%util` 모두 평소 수준. 디스크 I/O는 이번 장애와 무관했다는
것을 확인하는 대조군 역할을 했다.

## 4. 병목 특정 — 연쇄 장애 다이어그램

```text
CPU governor = powersave (저주파 고정, irqbalance 비활성)
        │
        ▼
NIC의 모든 IRQ가 CPU0 하나에만 매핑됨
        │
        ▼
트래픽 급증 → CPU0 인터럽트 처리 포화 (%sys 71.5%, 다른 코어는 한가)
        │
        ▼
RX ring buffer(256)가 처리 속도를 못 따라가 가득 참
        │
        ▼
rx_dropped 급증 + conntrack 테이블 포화("table full, dropping packet")
        │
        ▼
TCP 재전송 증가, 신규 연결 수립 실패
        │
        ▼
Nginx → WAS 연결 시도 중 "Connection refused" / 클라이언트 504
```

### 자원별 진단 결과 요약


| 영역          | 증상                                    | 근본 원인                                |
| ----------- | ------------------------------------- | ------------------------------------ |
| CPU         | CPU0만 %sys 71.5%, 나머지 코어는 65%+ idle   | IRQ가 전부 CPU0에 고정, governor=powersave |
| Network(수신) | rx\_dropped 18만+, ring buffer 256     | RX ring buffer가 트래픽 대비 과소 설정         |
| Network(연결) | conntrack "table full", TIME\_WAIT 다수 | conntrack 테이블/로컬 포트 범위가 작음           |
| Disk        | await/aqu-sz/%util 모두 평소 수준           | 이번 장애와 무관 (대조군)                      |
| Application | WAS CPU/메모리/응답시간 정상                   | 이번 장애와 무관 (배제 완료)                    |


## 5. 튜닝 — 영역별 설정값

> 원칙: **한 번에 하나만 바꾸고, 재현 가능한 부하로 전후를 비교·기록**한다. 아래
> 값은 이번 워크로드 기준의 출발점이며, 그대로 복사해 쓰는 값이 아니라 측정 후
> 조정하는 기준점으로 쓴다.

### 5-1. CPU — governor와 인터럽트 분산

```bash
# governor를 performance로 고정
echo performance | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# 영구 적용 (cpupower 패키지)
echo 'GOVERNOR="performance"' >> /etc/sysconfig/cpupower
```

```bash
# irqbalance 활성화 — NIC 인터럽트를 여러 코어로 분산
systemctl enable --now irqbalance
```

멀티 코어 인스턴스인데 NIC 큐가 1개뿐이라면, Receive Side Scaling(RSS)을 지원하는
드라이버/인스턴스 타입으로 큐 자체를 늘리는 것도 장기적으로 검토 대상이다.

### 5-2. 네트워크 — 큐/버퍼/연결 테이블 확장

```bash
# RX ring buffer 확장
ethtool -G eth0 rx 4096 tx 4096

# 오프로딩 확인 및 활성화 (CPU 부하 감소)
ethtool -K eth0 rx on tx on sg on tso on gso on gro on

# 인터럽트 coalescing — 인터럽트 횟수 자체를 줄임
ethtool -C eth0 rx-usecs 50 tx-usecs 50
```

```bash
# /etc/sysctl.d/90-net.conf
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.ip_local_port_range = 10240 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.netfilter.nf_conntrack_max = 1048576
net.netfilter.nf_conntrack_buckets = 262144
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_congestion_control = bbr
net.core.default_qdisc = fq
```

`nf_conntrack_max`는 기본값이 트래픽 규모 대비 작은 경우가 많아, `dmesg`에
`table full`이 보이면 가장 먼저 의심한다. BBR 혼잡 제어는 손실이 있는 네트워크
구간에서 처리량을 크게 개선하는 경향이 있어 함께 적용했다.

### 5-3. tuned 프로파일

```bash
tuned-adm active
# Current active profile: virtual-guest
tuned-adm profile network-latency
tuned-adm verify
```

### 5-4. 코드로 관리 (운영 표준화)

```yaml
- name: apply sysctl
  ansible.posix.sysctl:
    name: net.netfilter.nf_conntrack_max
    value: '1048576'
    sysctl_file: /etc/sysctl.d/90-net.conf

- name: enable irqbalance
  ansible.builtin.systemd:
    name: irqbalance
    enabled: true
    state: started
```

손으로 바꾼 값은 재부팅·신규 인스턴스 생성 시 사라진다. 프록시가 4대든 40대든
Ansible로 코드화해야 누락 없이 일관되게 적용되고, 이번처럼 "오래된 AMI라서
governor/irqbalance 설정이 빠져 있었다"는 식의 드리프트를 막을 수 있다.

## 6. 검증 — 부하 테스트 + Before/After


| 도구       | 대상          |
| -------- | ----------- |
| wrk, k6  | API/프록시 부하  |
| iperf3   | 네트워크 처리량    |
| sysbench | CPU/메모리 기준선 |


재현 가능한 부하(예: wrk로 동시 접속 12,000을 재현)를 걸어 변경 전/후를 비교한다.


| 지표                        | 변경 전    | 변경 후   |
| ------------------------- | ------- | ------ |
| CPU0 `%sys`               | 71.5%   | 24.0%  |
| 코어 간 사용률 편차               | 최대 63%p | 최대 9%p |
| rx\_dropped (5분)          | 184,032 | 0      |
| conntrack 'table full' 발생 | 발생      | 미발생    |
| 평균 응답시간                   | 1.1s    | 180ms  |
| 504 비율                    | 4%      | 0.05%  |


## 7. 단기 vs 장기 개선책


| 구분         | 조치                                                              | 비고                                |
| ---------- | --------------------------------------------------------------- | --------------------------------- |
| 단기 (즉시 적용) | CPU governor를 `performance`로 전환                                 | 재부팅 불필요, 즉시 반영                    |
| 단기         | `irqbalance` 활성화                                                | 인터럽트를 여러 코어로 자동 분산                |
| 단기         | RX/TX ring buffer 확장 (`ethtool -G`)                             | 드라이버/NIC가 지원하는 최대값 확인 후 적용        |
| 단기         | `nf_conntrack_max`, `somaxconn`, `tcp_max_syn_backlog` 상향       | sysctl                            |
| 단기         | BBR 혼잡 제어 적용                                                    | 손실 구간에서 처리량 개선                    |
| 장기         | 최신 Enhanced Networking 드라이버/인스턴스 타입으로 교체                        | 멀티 큐(RSS)로 NIC 인터럽트를 하드웨어 레벨에서 분산 |
| 장기         | Auto Scaling 트리거에 `rx_dropped`/인터럽트 분포 같은 네트워크 saturation 지표 포함 | CPU 평균 사용률만으로는 이번 같은 편중을 못 잡음     |
| 장기         | AMI/부트스트랩 스크립트에 governor·irqbalance·sysctl 기본값 포함               | "오래된 AMI라서 빠져 있었다"는 재발을 원천 차단     |
| 장기         | 네트워크 인터럽트/드롭률 상시 모니터링 대시보드 구축                                   | 평소 베이스라인 확보                       |
| 장기         | 분기 단위 `iperf3`/`wrk` 네트워크 부하 테스트 + 용량 계획                        | 피크 동접 추정치와 실제 한계치의 괴리 방지          |


## 8. 지속 가능한 운영

- **모니터링**: Grafana + Prometheus에 `rx_dropped`, 코어별 `%sys` 편차,
conntrack 사용률, TIME_WAIT 수 같은 saturation 지표를 트리거로 등록해, 평균
CPU 사용률만으로는 보이지 않는 편중/드롭을 조기에 잡는다.
- **표준화**: governor, irqbalance, sysctl 값을 Ansible로 코드화하고 AMI
빌드 파이프라인에도 포함시켜, 신규 인스턴스가 처음부터 올바른 기본값으로
뜨게 한다.
- **피드백 루프**: 이번 장애의 원인·조치·전후 수치를 런북으로 남겨, 다음에
"애플리케이션은 정상인데 느리다"는 증상이 나타나면 CPU 코어 편중과 NIC 드롭
카운터부터 바로 확인할 수 있게 한다.

## 마무리

- 이번 사례의 핵심은 "평균 CPU 사용률이 정상으로 보여도, 코어별 분포와 NIC
드라이버 카운터를 따로 보지 않으면 병목이 숨는다"는 것이다.
- WAS/애플리케이션을 먼저 배제한 뒤, 남은 네트워크·CPU 인터럽트 레이어에 집중한
접근이 원인을 빠르게 좁히는 데 결정적이었다.
- 다음에 비슷한 증상("앱은 정상인데 느리다")을 만나면: `mpstat -P ALL`(코어별
편중) → `/proc/interrupts`(IRQ 분포) → `ethtool -S`(드롭/에러 카운터) →
`dmesg`(conntrack/하드웨어 로그) 순으로 확인한다.

### 예상 질문

- **Q. CPU 사용률이 평균 50%였는데 왜 병목이라고 판단했나?**
평균은 코어 4개를 합쳐 나눈 값이라, 코어 1개가 100%에 가깝고 나머지가 거의
놀고 있어도 평균은 낮게 나온다. 코어별(`mpstat -P ALL`)로 쪼개 보지 않으면
이런 편중은 보이지 않는다.
- **Q. governor를 `performance`로 고정하면 전력 비용이 늘지 않나?**
전력을 직접 사서 쓰는 온프레미스/코로케이션 환경이라면 맞는 말이지만, 이번
구성은 EC2다. EC2는 인스턴스를 켜 둔 시간 기준으로 요금이 고정되지,
CPU governor 설정이나 실제 전력 소비량으로 과금되지 않는다 — 이미 그 비용을
내고 있는 인스턴스이므로 `performance`로 바꾼다고 AWS 요금이 늘지 않는다.
그래서 비용을 이유로 적용 범위를 제한할 필요는 없었고, 프록시 fleet 전체에
기본값으로 적용했다. (단, 지연에 둔감한 배치/백오피스성 워크로드는 체감 이득이
거의 없어 굳이 바꿀 이유가 없을 뿐이다.)
- **Q. ring buffer를 무작정 최대로 늘리면 안 되나?**
버퍼가 커질수록 큐에서 대기하는 시간(지연)도 함께 늘어날 수 있다(버퍼블로트).
그래서 하드웨어 최대값을 그대로 쓰기보다, 부하 테스트로 드롭이 사라지는
최소 구간을 찾아 적용하는 것이 원칙이다.

---

**참고자료**

- [Linux Performance Tuning: From Slow to Fast](https://www.linkedin.com/pulse/linux-performance-tuning-from-slow-fast-mayank-mishra-s7xwc/) —
CPU governor/IRQ affinity, NIC ring buffer·오프로딩, conntrack/BBR 등
네트워크 스택 튜닝 포인트와 실제 장애 사례(ring buffer war story)를 참고했다.
- [서버 성능 분석 및 최적화 방안](https://strawberry125.tistory.com/233) —
측정 → 병목 특정 → 튜닝 → 검증 절차와 USE Method 틀을 참고했다.
- Rocky Linux 9 서버 OS 튜닝 정리 자료 — sysctl 파라미터 적용 방식과
Ansible 코드화 예시를 참고했다.

[^governor]: 커널이 상황에 따라 CPU 클럭 속도를 자동으로 올리고 내리는 전력
    관리 정책. `performance`(항상 최고 클럭), `powersave`(절전 우선) 등의
    모드가 있다.
[^frequency]: CPU가 1초에 처리하는 클럭 사이클 수. 높을수록 같은 시간에 더
    많은 연산·인터럽트를 처리할 수 있다.
[^irq]: Interrupt ReQuest(인터럽트 요청)의 줄임말. 하드웨어가 "이 작업 좀
    지금 처리해달라"고 CPU에 보내는 신호다. NIC에 패킷이 도착할 때마다
    IRQ가 발생하고, 커널은 그 IRQ를 특정 CPU 코어에 배정해 처리하게 한다 —
    즉 어떤 IRQ가 어느 코어에 배정되느냐가 "어떤 코어가 이 하드웨어의
    인터럽트를 처리하느냐"를 결정한다.
[^ring-buffer]: NIC가 받은 패킷을 CPU가 처리하기 전까지 잠깐 담아두는
    하드웨어 큐다. CPU가 인터럽트를 처리해 패킷을 꺼내가는 속도보다 패킷이
    들어오는 속도가 빠르면 이 큐가 가득 차고, 그 이후 도착하는 패킷은 자리가
    없어 그냥 버려진다 — 그게 `rx_dropped`다.
[^conntrack]: 리눅스 커널이 지금 오가고 있는 모든 연결(connection)의 상태를
    기록해두는 표다. NAT나 방화벽(iptables/nftables)이 "이 응답 패킷이 어느
    연결에 대한 응답인지" 매칭하려면 이 표가 있어야 하고, 표에는 최대 항목
    수(`nf_conntrack_max`) 제한이 있다. 동시 연결 수가 이 한도를 넘으면
    커널이 새 연결 자체를 거부하는데, 그게 `table full, dropping packet`이다.