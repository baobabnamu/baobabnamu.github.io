---
isDraft: true
headline: "kata-containers로 GPU 컨테이너를 VM처럼 격리하기 정리"
subHeadline: "NAVER ENGINEERING DAY 2026 발표를 바탕으로, kata에 GPU·IB NIC·NVMe를 붙이며 생긴 4가지 문제와 해결 방법"
excerpt: "컨테이너 탈출 취약점에 대비해 GPU 워크로드를 kata-containers VM으로 격리하면서 겪은 partition 할당, IB·NVMe 성능, 부팅 시간, vCPU 배치 문제와 해결 과정"
category: "OPS"
publishDate: 2026-11-02
---

## 1. 배경 — 왜 GPU 컨테이너를 VM으로 격리했나

최근 2년 사이 컨테이너에서 host로 빠져나가는 취약점이 runc와 NVIDIA Container Toolkit에서 반복해서 나왔다.

| 공개 | 대상 | 취약점 | 영향 |
| --- | --- | --- | --- |
| 2024.01 | runc | CVE-2024-21626 | 작업 디렉터리 fd 누출로 host filesystem 접근 |
| 2024.09 | NVIDIA Container Toolkit | CVE-2024-0132 | 파일 경로 경쟁 조건으로 host filesystem 접근 |
| 2025.07 | NVIDIA Container Toolkit | CVE-2025-23266 | 짧은 Dockerfile만으로 host root 획득 (NVIDIAScape) |
| 2025.11 | runc | CVE-2025-31133 외 2건 | mount 경쟁 조건으로 /proc 쓰기, host root 획득 |

공통점은 **모두 host kernel을 공유하는 컨테이너에서 시작해 host까지 닿는다**는 것이다. 여러 사용자가 GPU 노드를 나눠 쓰는 클라우드 환경에서는 한 사용자의 탈출이 곧 다른 사용자의 피해가 된다.

그래서 목표는 "사용자 작업은 VM으로 격리하고, Kubernetes 운영자는 일반 Pod처럼 관리"하는 것이었다. 구체적으로 세 가지를 만족해야 했다.

1. **multi-node training.** 노드 2대의 GPU 16장을 VM에 할당하고 IB로 묶어 학습 작업 하나를 돌린다.
2. **node 공유.** 노드 1대의 GPU 8장을 1·1·2·4장으로 나눠 사용자 4명이 쓴다.
3. **보안.** 컨테이너 안에서 root를 얻어도 다른 사용자와 host에는 영향이 없어야 한다. 메모리는 VM 단위로, GPU는 IOMMU[^iommu]로 격리된다.

## 2. kata-containers 구조

runc는 namespace와 cgroup으로 프로세스와 자원을 나눌 뿐, system call은 모두 같은 host kernel이 처리한다. kata는 Pod마다 VM을 띄우고 별도의 guest kernel을 실행해, CPU 하드웨어 가상화(VT-x) 경계를 하나 더 둔다.

| 항목 | runc | kata | 일반 VM |
| --- | --- | --- | --- |
| kernel | host와 공유 | Pod마다 별도 | host와 별도 |
| 관리 | Kubernetes Pod | Kubernetes Pod | 별도 VM 관리 |
| image·exec·logs | 사용 가능 | 사용 가능 | 해당 없음 |
| GPU | host driver | guest driver, passthrough | guest driver, passthrough |
| memory | cgroup | cgroup | 고정 할당 |
| 기동 | 즉시 | 수십 초~수 분 | 수 분 |

kata는 runc의 운영 편의성과 VM의 격리 수준을 함께 가져가는 위치에 있다. GPU driver는 guest kernel에만 들어가고 host에는 설치하지 않는다.

### 2-1. Pod 실행 경로 (kata-qemu)

```text
kubelet          Pod 실행 요청 (일반 Pod와 동일)
   │
containerd       Pod마다 kata shim 하나 실행
   │
kata shim        Pod 설정을 보고 VM 사양 결정
   │
QEMU             VM 부팅, GPU를 PCI device로 연결
───────────────── VM 경계 ─────────────────
guest kernel     Pod 전용 kernel에서 GPU driver load
   │
kata-agent       vsock으로 shim의 명령을 받아 container 생성
   │
container        VM 안에서 실행, 사용자에게는 일반 Pod처럼 보임
```

### 2-2. VM에서 GPU를 쓰는 방법 — passthrough

1. **IOMMU**가 GPU의 메모리 접근 주소를 host의 실제 주소로 변환하고, VM 밖으로의 접근은 막는다.
2. GPU가 host driver에 묶여 있으면 VM에 넘길 수 없다. 그래서 GPU를 **vfio-pci**에 binding한 뒤 QEMU를 통해 VM에 전달한다.
3. VM 안의 NVIDIA driver가 GPU를 직접 제어하므로 가상화 계층을 거치지 않는다.

### 2-3. 구현하며 만난 문제

| 이슈 | 내용 |
| --- | --- |
| 이슈 1 | GPU 조합이 정해진 partition과 일치해야 한다 |
| 이슈 2 | VM에서 IB 네트워크와 로컬 스토리지를 제대로 쓸 수 없다 |
| 이슈 3 | VM이 Pod spec과 다른 크기로 만들어지고, 부팅도 오래 걸린다 |
| 이슈 4 | vCPU 배치 오류로 성능이 떨어지거나 guest가 hang에 걸린다 |

## 3. 이슈 1 — GPU는 partition 단위로만 할당된다

NVSwitch로 GPU를 묶는 HGX 노드에서는 Fabric Manager가 미리 정의한 partition 단위로만 VM에 GPU를 넘길 수 있다. 예를 들어 2장짜리 partition이 1·3, 2·4, 5·7, 6·8로 정의돼 있다면, 2장 요청에 GPU 1·3은 되지만 1·2나 4·5는 partition 두 개에 걸치므로 안 된다.

### 3-1. device plugin으로는 강제할 수 없었다

| 시도 | 결과 |
| --- | --- |
| 기본 device plugin으로 개수만 요청 | partition과 맞지 않는 조합이 배정돼 VM에서 CUDA 초기화 실패 (오류 802) |
| annotation으로 GPU를 직접 지정 | kubelet이 annotation을 반영하지 않아 지정한 GPU가 VM에 전달되지 않음 |
| GetPreferredAllocation()으로 partition에 맞는 조합 추천 | 추천일 뿐이라 안 맞으면 기본 배정으로 넘어감. Pod 삭제로 GPU가 반납돼도 plugin에 알릴 API가 없음 |

**device plugin은 개수만 받을 뿐 조건을 표현할 수 없고, 반납 시점도 알 수 없다.**

### 3-2. DRA로 전환

DRA[^dra]는 스토리지의 PV/PVC처럼 device를 요청·할당하는 Kubernetes API다(1.34에서 GA).

| 역할 | storage | device (DRA) |
| --- | --- | --- |
| Pod 쪽 참조 | volumes | resourceClaims |
| 요청 | PVC (용량) | ResourceClaim (속성 조건 + 묶음 조건) |
| 실제 자원 | PV | ResourceSlice (device + 속성) |
| 등록 주체 | CSI driver | DRA driver |
| 종류 구분 | StorageClass | DeviceClass |

핵심 차이는 ResourceClaim에 CEL로 속성 조건을, matchAttribute로 "같은 값을 가진 device끼리 묶어서" 조건을 걸 수 있다는 점이다. 스케줄러가 device를 고르고(status.allocation), 노드의 DRA driver가 준비·해제(NodePrepare / Unprepare)를 맡기 때문에 partition 선택, 중복 할당 방지, 반납 처리를 모두 할 수 있다.

### 3-3. 기존 DRA driver 대신 자체 driver

| driver | 한계 |
| --- | --- |
| NVIDIA GPU DRA | NVML로 GPU를 조회하므로 host GPU driver가 필요. vfio-pci에 묶인 GPU는 못 다룸 |
| dranet | NIC를 Pod network로 옮기는 방식이라 vfio-pci NIC를 VM에 넘기지 못함 |
| 둘을 함께 사용 | 같은 PCIe switch의 GPU와 NIC를 묶으려면 서로 다른 driver의 device를 연결해야 해서 별도 구현 필요 |

그래서 GPU partition과 IB NIC를 한 driver에서 발행하는 자체 DRA driver를 만들었다.

| device 종류 | 할당 단위 |
| --- | --- |
| gpu-partition | Fabric Manager partition 1개 |
| ib-railset | 각 GPU와 같은 PCIe switch에 붙은 compute IB NIC 묶음 |
| ibvf-storage | storage network용 VF |

H100 노드 한 대에는 8장 1개, 4장 2개, 2장 4개, 1장 8개로 partition이 15개 있다. 스케줄러는 GPU별 카운터(SharedCounters)로 같은 GPU를 포함한 partition이 동시에 선택되지 않게 막는다.

### 3-4. 사용자는 template 이름만 쓴다

관리자가 "8장짜리 partition 1개" 같은 조건을 ResourceClaimTemplate에 한 번 정의하고, 사용자는 Pod에서 그 이름만 참조한다. 아래는 발표 예시를 줄인 형태다.

```yaml
# 관리자: ResourceClaimTemplate
requests:
- name: gpu
  exactly:
    deviceClassName: kata-gpu.nks.ncloud.com
    count: 1
    selectors:
    - cel:
        expression: "device.attributes['kata-gpu.nks.ncloud.com'].size == 8"

# 사용자: Pod spec
resourceClaims:
- name: gpu
  resourceClaimTemplateName: kata-nks-8gpu
```

할당된 GPU는 CDI device ID → containerd의 OCI device → QEMU의 vfio-pci 옵션 순서로 VM까지 전달된다. upstream kata에는 DRA device를 VM에 연결하는 경로가 없어서 kata shim이 kubelet에서 DRA device를 조회하도록 직접 구현했고, GPU를 이중으로 등록하지 않도록 device plugin은 제거했다. 이 변경은 upstream 반영을 진행 중이다(kata-containers 이슈 #13322).

### 3-5. 결과 — B200 한 대에서 VM 4개 동시 실행

1+1+2+4장 조합을 한 노드에서 동시에 띄우고 NCCL all_reduce busbw(8.59 GB)를 비교했다.

| 조건 | kata guest | bare metal container |
| --- | --- | --- |
| 2장, 4개 VM 동시 실행 중 | 627.0 GB/s | 629.7 GB/s |
| 4장, 4개 VM 동시 실행 중 | 681.9 GB/s | 683.3 GB/s |
| 8장 단독 | 835.9 GB/s | 839.7 GB/s |

NVLink 대역폭은 bare metal과 사실상 같다.

## 4. 이슈 2 — VM에서 IB와 로컬 NVMe 쓰기

### 4-1. IB NIC — NCCL이 먼 NIC를 고른다

host의 RDMA device file만 공유하면 VM 안에 driver가 없어 쓸 수 없다. 그래서 NIC 자체를 VFIO로 넘겼다.

- **compute HCA** (NCCL 통신): PF 8개를 GPU 수에 맞게 그대로 전달
- **storage HCA**: SR-IOV로 VF 16개를 만들고 VM마다 2개씩 전달
- **driver**: mlx5·IB driver를 포함해 guest kernel을 빌드

RDMA는 동작했지만 성능이 낮았다. VM 안에서는 PCIe 연결 관계가 보이지 않아, NCCL이 GPU와 다른 switch에 있는 NIC를 골랐기 때문이다. 2노드·16 GPU(B200) all_reduce가 158 GB/s에 그쳤다.

해결은 두 단계다.

1. **선택.** DRA driver가 같은 PCIe switch의 GPU·NIC를 ib-railset으로 묶어 발행하고, claim에서 matchAttribute로 GPU와 NIC가 같은 partition ID를 갖도록 요청한다.
2. **전달.** NCCL topology file[^nccl-topo]을 VM 안에 넣어 준다.

```text
생성  DRA driver가 claim 준비 단계에서 host /run/kata-gpu-topo/<UID>.xml 작성
주입  CDI로 topo.xml을 mount하고 NCCL_TOPO_FILE 환경 변수 설정
전달  virtiofs로 guest에 공유
삭제  claim 해제 시 파일 제거 (파일 생성에 실패하면 claim 준비도 실패)
```

그 결과 같은 조건의 all_reduce가 **158 GB/s → 620 GB/s로 약 4배** 올랐다.

### 4-2. 로컬 NVMe — 공유와 성능을 함께 얻기

| 방식 | I/O 경로 | 공유 | 속도 |
| --- | --- | --- | --- |
| virtio-fs | guest → virtiofsd → host filesystem → NVMe | 여러 VM | 4.75 GB/s |
| virtio-blk | guest → QEMU → host kernel → NVMe | 여러 VM | 2.1 GB/s |
| passthrough | guest → NVMe (VFIO 직결) | VM 하나가 독점 | 10.0 GB/s |

세 방식 모두 공유와 성능을 동시에 만족하지 못해서, NVMe를 SPDK logical volume(lvol)으로 나누고 vhost-user-blk로 VM에 붙였다.

- SPDK가 NVMe를 userspace에서 직접 구동하고, VM과는 공유 메모리 ring(virtqueue)으로 요청을 주고받는다. I/O마다 VM exit이나 system call이 생기지 않고 host kernel도 거치지 않는다.
- upstream kata CSI는 host 파일을 거쳐서 lvol 직결 대비 절반 수준이라, CSI에 lvol 타입을 추가해 PVC마다 lvol 하나씩 할당했다.
- SPDK는 interrupt 대신 계속 polling하므로 전용 core가 100%로 돈다. 이 core를 Pod나 vCPU와 공유하면 I/O가 늦어지고 vCPU 성능도 떨어지므로, kubelet과 kata 양쪽에서 SPDK core를 CPU 할당 대상에서 뺐다.

### 4-3. 이슈 2 측정 결과

| 항목 | upstream 기본 | 내부 수정본 | 측정 |
| --- | --- | --- | --- |
| all_reduce (2node 16-GPU, railset) | 158 GB/s | 620 GB/s | NCCL busbw |
| GPUDirect RDMA (8 GiB) | 미제공 | 698.5~712.4 GB/s (GDR 끔: 241~266) | NCCL busbw |
| IB ib_write_bw -q4 | 미제공 | 387.2 Gb/s (PF 387.3) | B200 |
| B200 2node all_reduce (compute PF) | 미제공 | 697.6 / 699.6 GB/s | NCCL busbw |
| H100 2node all_reduce | 미제공 | 367.0 GB/s | NCCL busbw |
| disk 순차 읽기 | virtio-fs 4.75 GB/s | SPDK 19.8 GB/s | fio |
| disk 순차 쓰기 | virtio-fs 3.74 GB/s | SPDK 14.1 GB/s | fio |
| disk random 4K 읽기 | 87.8k IOPS | 1154k IOPS | fio |

SPDK 쪽은 NVMe 2장을 raid0으로 구성한 값이다.

## 5. 이슈 3 — 8-GPU VM 부팅 시간과 메모리 배치

upstream kata 기본 설정으로 8-GPU VM을 띄우면 kubelet 제한 시간(4분) 안에 부팅이 끝나지 않아 Pod 생성이 실패했다. guest NUMA도 1개로 잡혀 GPU→host 복사 성능이 떨어졌다.

### 5-1. GPU memory mapping을 THP로

B200 8장의 HBM 합계는 1,440 GiB다. 이를 4 KiB page로 매핑하면 약 3.5억 개, THP[^thp](2 MiB)로 매핑하면 약 69만 개로 1/512이 된다. 매핑할 page 수가 줄어든 만큼 VM 준비 시간이 짧아진다.

### 5-2. hugepage-1Gi 요청량을 VM 크기에 반영

upstream kata는 Pod의 hugepage 요청을 VM 크기 계산에 넣지 않는다. 예를 들어 container가 memory 2Gi + hugepages-1Gi 14Gi를 요청해도 VM은 default_memory 8Gi + 2Gi로만 만들어진다. 이를 고쳐 **Pod 요청량은 VM 크기로, container 요청량은 guest process 몫으로** 반영되게 했다. 2,688 GiB guest memory라면 4 KiB page 약 7억 개가 1 GiB page 2,688개로 줄어든다.

### 5-3. guest NUMA를 host와 일치

guest NUMA가 1개면 메모리와 GPU가 서로 다른 socket에 놓여 inter-socket link를 건너가게 된다. enable_numa와 numa_mapping으로 guest node를 host socket에 하나씩 대응시켜, 메모리와 GPU가 같은 socket에 있게 했다.

### 5-4. 이슈 3 결과 (B200)

| 항목 | upstream 기본 | 내부 수정본 |
| --- | --- | --- |
| 4-GPU Pod 준비 시간 | 183초 (THP=never) | 33초 (THP=always + hugepage-1Gi) |
| 8-GPU Pod 부팅 | 4분 초과, 부팅 불가 | 97초 |
| hugepage-1Gi | 무시됨 | guest memory로 사용 |
| guest topology | NUMA 1개 | NUMA 2개, GPU 4+4 |
| 8장 동시 GPU→host 복사 | 410.9 GB/s | 459.0 GB/s |

hugepage-1Gi 처리는 내부 수정본으로 운영 중이고 upstream 반영을 논의하고 있다.

## 6. 이슈 4 — vCPU 배치 오류

upstream kata의 vCPU 고정 기능을 쓰면 오류나 경고 없이 두 가지 문제가 생겼다.

- **성능 저하**: physical CPU 하나에 vCPU 두 개가 놓이면 각자 절반 성능으로 돈다.
- **guest hang**: vCPU가 host kernel이나 storage polling용으로 예약한 CPU에 놓이면 guest 전체가 멈춘다. Pod는 Running인데 exec가 응답하지 않는다.

세 가지를 함께 적용해 해결했다.

1. **Pod별 전용 CPU (kubelet).** CPU Manager static 정책과 container resources로 Pod마다 겹치지 않는 CPU를 준다. 겹치면 Pod 간 공유로 0.5배 성능이 된다.
2. **vCPU 1:1 고정 (kata).** enable_vcpus_pinning으로 vCPU와 physical CPU를 1:1로 고정한다.
3. **예약 CPU 제외.** kata 옵션을 추가해 예약 core를 모든 VM의 vCPU 배치 대상에서 뺀다.

## 7. 최종 결과 — 사용자가 쓰는 Pod spec

```yaml
spec:
  runtimeClassName: kata-gpu-b200-4gpu      # B200 4-GPU tier runtime
  resourceClaims:
  - name: gpu
    resourceClaimTemplateName: kata-gpu-b200-4gpu   # GPU 4장 + IB NIC
  containers:
  - name: app
    resources:
      limits: {cpu: "32", memory: 1Mi, hugepages-1Gi: 1299Gi}
      claims:
      - name: gpu
```

VM 크기는 container 요청량 합(1299Gi)에 class overhead(45Gi)를 더한 1344Gi가 된다. Pod IP, Service, NetworkPolicy, DNS는 일반 Pod와 똑같이 쓴다.

| 요구사항 | kata에 더한 개선 |
| --- | --- |
| GPU를 partition 단위로 할당 | DRA driver로 partition 발행, 중복 할당 차단 |
| VM에서 IB·NVMe 직접 사용 | IB PF·ib-railset 전달, SPDK lvol 분할 |
| 8-GPU VM을 4분 안에 부팅 | THP, hugepage-1Gi, guest NUMA 동기화 |
| VM 간 vCPU 겹침 없이 배치 | vCPU 1:1 고정, 예약 core 제외 |

최종적으로 bare metal 대비 LLM 추론 처리량 93~99%를 냈고, NVLink·IB 대역폭은 동일했다.

## 마무리

- 핵심은 "**격리는 VM 수준으로 올리되, 성능과 운영 방식은 bare metal·일반 Pod에 맞춘다**"는 것이다.
- 막힌 지점은 대부분 "VM 안에서는 host의 하드웨어 배치(partition, PCIe switch, NUMA, 예약 core)가 보이지 않는다"는 한 가지 원인으로 모인다. 해결도 그 정보를 DRA driver, topology file, NUMA 매핑, CPU 고정으로 VM에 다시 전달하는 방식이었다.
- upstream 기본값으로는 대규모 GPU VM이 부팅조차 안 되는 경우가 있으므로, 도입 전에 부팅 시간·NCCL 대역폭·디스크 I/O를 bare metal과 나란히 측정해 보는 것이 좋다.

### 예상 질문

- **Q. 그냥 일반 VM을 쓰면 안 되나?** 격리 수준은 같지만 VM을 따로 관리해야 하고 image·exec·logs 같은 컨테이너 작업 흐름을 쓸 수 없다. kata는 Kubernetes Pod로 관리하면서 VM 격리를 얻는다.
- **Q. VM이면 성능이 떨어지지 않나?** GPU·NIC를 passthrough하고 topology와 NUMA를 맞추면 NVLink 대역폭은 bare metal과 거의 같고, LLM 추론 처리량도 93~99% 수준이었다. 반대로 이 작업 없이 기본값으로 쓰면 all_reduce가 1/4로 떨어지는 등 차이가 크다.
- **Q. device plugin을 고쳐 쓰면 안 되나?** 개수만 받는 인터페이스라 partition 조건을 강제할 수 없고 반납 시점도 알 수 없다. 조건부 할당과 해제 처리가 필요하면 DRA가 맞다.

---

**참고자료**

- [컨테이너처럼 쓰고, VM처럼 격리하기: kata-containers with GPU (NAVER D2)](https://d2.naver.com/helloworld/2265641) — 김동현(Container Service), NAVER ENGINEERING DAY 2026 발표. 이 글의 전체 내용을 발표 자료를 바탕으로 정리했다.
- [NVIDIA Fabric Manager User Guide](https://docs.nvidia.com/hgx-platforms/fabric-manager-user-guide) — Shared NVSwitch partition 개념을 참고했다.
- [kubernetes-sigs/dra-driver-nvidia-gpu](https://github.com/kubernetes-sigs/dra-driver-nvidia-gpu) — NVIDIA GPU DRA driver.
- [kubernetes-sigs/dranet](https://github.com/kubernetes-sigs/dranet) — 네트워크 device용 DRA driver.

[^iommu]: IOMMU는 device가 접근하는 메모리 주소를 변환하고, 허용된 범위 밖의 접근을 막는 하드웨어다. CPU에 MMU가 있듯 device에도 주소 변환 장치를 두는 셈이라, GPU를 VM에 통째로 넘겨도 GPU가 다른 VM이나 host의 메모리를 건드릴 수 없다. vfio-pci는 이 IOMMU를 이용해 device를 host driver 대신 VM(QEMU)에 넘길 수 있게 묶어 두는 kernel driver다.
[^dra]: DRA(Dynamic Resource Allocation)는 GPU·NIC 같은 device를 PVC처럼 "조건을 담은 요청(ResourceClaim)"으로 받아 스케줄러가 골라 주는 Kubernetes API다. driver가 발행한 device 목록이 ResourceSlice, Pod의 device 요청이 ResourceClaim이다. 개수만 세던 device plugin과 달리 device 속성을 CEL 식으로 걸러내고, 여러 요청을 같은 속성 값끼리 묶을 수 있다.
[^nccl-topo]: NCCL은 NVIDIA의 GPU 간 집합 통신 라이브러리로, 보통 sysfs에서 PCIe 구조를 읽어 각 GPU에 가장 가까운 NIC를 고른다. VM 안에서는 PCIe 구조가 평평하게 보여 이 판단이 틀어지므로, GPU와 NIC의 실제 연결 관계를 XML로 적은 topology file을 NCCL_TOPO_FILE로 직접 알려 준다.
[^thp]: THP(Transparent Huge Pages)는 kernel이 자동으로 2 MiB 같은 큰 page를 쓰게 하는 기능이다. hugepage는 2 MiB나 1 GiB page를 미리 예약해 두고 쓰는 메모리다. 둘 다 page 수를 줄여 매핑과 주소 변환(TLB) 비용을 낮추는데, 수 TB 메모리를 다루는 GPU VM에서는 이 차이가 부팅 시간 수 분 단위로 드러난다.
