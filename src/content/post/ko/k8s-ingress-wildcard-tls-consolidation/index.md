---
isDraft: true
headline: "인프라 스터디 (11월 1주차) - 제각각이던 k8s 서비스 노출 경로를 ingress-nginx + 와일드카드 TLS로 통합한 과정 학습"
subHeadline: "ingress 한 줄 바꾸는 일이 아니라, 서비스마다 다른 설치 방식과 ‘앱이 스스로 아는 자기 URL’을 맞추는 일이었다"
excerpt: "sslip 호스트, LoadBalancer VIP, ClusterIP로 제각각 노출되던 k8s 웹 UI 7개를 서비스별 Ingress와 와일드카드 인증서로 통합하면서, 영향도 순 Phase gate·dual-path·설치 방식별 SSOT 원칙으로 단계적으로 전환한 사례"
category: "OPS"
publishDate: 2026-11-04
---

## 시나리오

- **목적**: 한 클러스터 안에서 서비스마다 제각각이던 외부 노출 방식(sslip 호스트, LoadBalancer VIP 직노출, ClusterIP)을 `idc-서비스명.example.com` + HTTPS 하나로 통일하는 과정을, 다른 클러스터에서도 그대로 따라 할 수 있는 절차로 정리한다.
- **상황 요약**: 웹 UI 7개(Wazuh, Harbor, AWX, Headlamp, Grafana, Argo CD, Jenkins)를 서비스별 Ingress + 기존 와일드카드 인증서 재사용으로 전환했다. 6개는 전환을 마쳤고 Jenkins만 남았다. 실제 어려움은 ingress가 아니라 **서비스마다 다른 설치 방식(Helm / Kustomize / Operator / 수동)과, 각 앱이 스스로 생성하는 자기 URL 설정**에 있었다.

```text
현황 조사 → 영향도 분류 → 가장 안전한 서비스 1개 전환 → Go/No-Go 확인 → 커밋 → 다음 서비스 (반복)
```

이 루프를 돌리는 동안 **클러스터를 직접 고치지 않고, 그 서비스를 설치한 방식의 원본 파일(SSOT)을 고쳐서 반영한다**는 원칙을 지킨다.

## 1. 배경 — 서비스마다 다른 문으로 드나들던 클러스터

```text
[변경 전]
사용자 ──HTTP──▶ <ingress-vip>:80 ──(host: *.<ingress-vip>.sslip.io)──▶ jenkins, wazuh
사용자 ──HTTP──▶ <ingress-vip>/grafana, /alertmanager (subpath)    ──▶ grafana, alertmanager
사용자 ──────▶ <harbor-vip> / <awx-vip> / <prometheus-vip> (MetalLB LB 직노출)
(외부 접근 불가)  headlamp, argocd-server (ClusterIP)

[변경 후]
사용자 ──HTTPS──▶ <ingress-vip>:443 (ingress-nginx, *.example.com 인증서로 TLS 종단)
                    ├─ idc-wazuh     ─▶ wazuh/dashboard:443 (HTTPS backend)
                    ├─ idc-argocd    ─▶ argocd/argocd-server:443 (HTTPS backend)
                    ├─ idc-headlamp  ─▶ kube-system/headlamp:80
                    ├─ idc-grafana   ─▶ monitoring/grafana:80
                    ├─ idc-awx       ─▶ awx/awx-service:80   (+ 기존 LB 유지)
                    ├─ idc-harbor    ─▶ harbor/harbor:80      (LB 반납)
                    └─ idc-jenkins   ─▶ jenkins/jenkins:8080  (남은 작업)
스크립트/에이전트 ──HTTP──▶ <awx-vip>, <prometheus-vip> (데이터 경로는 그대로)
```

하나의 거대한 Ingress가 아니라 **서비스마다 자기 네임스페이스에 Ingress 리소스를 하나씩** 둔다. 외부 진입점(ingress-nginx controller의 VIP)은 공유되고, controller가 모든 Ingress를 모아 하나의 `nginx.conf`로 합친다. Helm 차트의 생명주기와 잘 맞고, 한 서비스의 실수가 다른 서비스로 번지지 않는다.

- Kubernetes v1.28, ingress-nginx controller v1.14 (Helm 설치), 외부 IP는 MetalLB가 할당한다.
- cert-manager는 설치돼 있지 않다. 대신 다른 서비스가 쓰던 `*.example.com` 와일드카드 인증서 Secret이 하나 있었다(OV 인증서, 만료까지 약 17개월).
- 노출 방식은 세 갈래였다: sslip 호스트[^sslip]로 HTTP 서비스, MetalLB VIP 직노출, ClusterIP 전용.
- Grafana의 `root_url`은 **MetalLB 풀에 있지만 아무 서비스에도 할당되지 않은 IP**를 가리키고 있었다. 알림 링크와 공유 링크가 전부 깨진 채였는데, 이때는 아무도 몰랐다.

### 진행 흐름

| 단계 | 대상 | 결과 |
| --- | --- | --- |
| Phase 0 | DNS 등록, 인증서 Secret을 각 네임스페이스로 복제 | 완료 |
| Phase 1 | Headlamp (ClusterIP → 신규 노출) | 완료. 파이프라인 end-to-end 검증용 |
| Phase 2 | Argo CD (HTTPS backend) | 완료 |
| Phase 3 | Wazuh (sslip host 교체) | 완료 |
| Phase 4 | Grafana host 전환 + Alertmanager 외부 차단 | 완료 |
| Phase 5 | AWX (LB 유지 + ingress 추가) | 완료 |
| Phase 6 | Harbor (LB → ingress 교체) | 완료 |
| Phase 7 | Jenkins (sslip host 교체) | 대기 |

핵심 단서는 **같은 "ingress 붙이기"라도 서비스마다 바꿔야 하는 파일과 깨지는 사용자가 전혀 다르다**는 점이었다. 그래서 일괄 적용 대신 서비스별로 쪼개고, 영향이 작은 것부터 순서를 매겼다.

## 2. 접근 원칙 — 영향 0부터, 한 번에 한 서비스씩

순서를 정하는 기준이 두 가지 있었다.

1. **사용자 영향이 없는 것부터.** 아무도 쓰지 않던 Headlamp를 첫 대상으로 삼아 "와일드카드 인증서 + ingress-nginx + DNS" 조합이 동작하는지부터 확인했다. 여기서 실패하면 다른 서비스로 넘어가지 않는다. 반대로 docker 클라이언트 전원이 영향을 받는 Harbor는 맨 마지막에 단독으로 진행했다.
2. **설치한 방식의 원본을 고친다.** Helm으로 설치한 서비스는 values 파일, Kustomize면 kustomization, Operator면 CR 파일을 고쳐 반영한다. `kubectl patch`나 `kubectl edit`로 직접 고치면 다음에 누가 원래 방식으로 재배포할 때 조용히 덮어써진다.

각 Phase 사이에는 **Go/No-Go 게이트**를 둔다. 새 호스트가 HTTPS로 응답하는지, 인증서 체인이 맞는지, UI 로그인과 핵심 기능이 되는지 확인한 뒤에만 Git에 커밋하고 다음 Phase로 간다. 테스트에 쓴 파일과 커밋하는 파일이 같아야 나중에 재현이 된다.

```text
서비스 하나를 전환할 때 확인할 네 가지
1. 설치 방식     : Helm / Kustomize / Operator / 수동 → 어느 파일을 고칠지
2. 기존 노출     : sslip host / LB VIP / ClusterIP  → 누가 기존 주소를 쓰고 있는지
3. backend 프로토콜 : HTTP / HTTPS(self-signed)      → ingress annotation
4. 앱의 자기 URL  : root_url, externalURL 등       → 링크·리다이렉트·CSRF
```

이번 사례에서는 4번 "앱의 자기 URL"이 가장 자주 빠뜨리기 쉬운 항목이었다.

## 3. 측정 — 서비스별 현재 노출 방식 조사

```bash
kubectl get ingress -A                                   # 이미 ingress로 노출 중인 것
kubectl get svc -A | grep LoadBalancer                   # VIP로 직노출 중인 것
helm list -A                                             # Helm으로 설치된 릴리스와 차트 버전
kubectl -n <ns> get secret <wildcard-secret> -o jsonpath='{.data.tls\.crt}' \
  | base64 -d | openssl x509 -noout -subject -issuer -enddate   # 재사용할 인증서 확인
```

### 3-1. 노출 방식 — 계획과 실제가 달랐다

처음 계획은 "Grafana / Alertmanager / Prometheus는 ClusterIP라서 ingress를 새로 만든다"는 전제였다. 실제로 조사해 보니 달랐다.

```bash
kubectl -n monitoring get ingress
```

```text
NAME                         CLASS   HOSTS   ADDRESS         PORTS
prometheus-stack-grafana     nginx   *       <ingress-vip>   80     # path: /grafana
prometheus-stack-alertmanager nginx  *       <ingress-vip>   80     # path: /alertmanager
```

Grafana와 Alertmanager는 이미 ingress VIP 아래 subpath로 **인증 없이 HTTP로** 노출돼 있었다. Prometheus만 ingress가 없고 LB VIP로 사내에서만 접근하고 있었다. 작업 내용이 "새로 만들기"에서 "기존 것을 고치고, 하나는 닫기"로 바뀌었다. **계획서의 전제는 실행 직전에 다시 조사해서 확인한다.**

### 3-2. 설치 방식 — 서비스마다 SSOT가 다르다

```bash
helm -n kube-system get values headlamp    # null → chart default로만 설치됨
kubectl -n wazuh get ingress wazuh-dashboard -o yaml | grep -E 'helm|last-applied'
kubectl -n awx get awx                     # Operator CR 존재 확인
```

```text
headlamp   : Helm, override 없음 (get values = null)
wazuh      : 수동 kubectl apply (helm label 없음, last-applied-configuration만 있음)
argocd     : Kustomize (별도 Git 저장소), 자기 자신을 self-manage 하지 않음
awx        : awx-operator가 CR을 보고 ingress/svc를 만든다
grafana    : Helm (kube-prometheus-stack), values 파일이 Git에 있음
harbor     : Helm, values 파일이 Git에 있음 (uncommitted 수정 상태였음)
```

여기서 Git 작업 트리에 **커밋되지 않은 수정**이 남아 있는 values 파일이 두 개 발견됐다. 내 변경과 섞이지 않도록 `git diff`로 먼저 검토하고 시작했다.

### 3-3. 대조군 — 손대지 않을 것

```bash
curl -sI http://<prometheus-vip>:9090/-/ready
```

```text
HTTP/1.1 200 OK
```

Prometheus는 web 노출이 없고, LB VIP가 에이전트·Grafana datasource·remote_write가 참조하는 **데이터 경로**였다. 바꾸면 얻는 것보다 깨지는 것이 많아서 이번 범위에서 제외하고, 매 Phase 뒤에 여전히 응답하는지만 확인했다.

## 4. 원인 특정 — 서비스별로 작업이 달라지는 이유

```text
노출 경로를 하나로 통일하고 싶다
        │
        ▼
앱마다 설치 방식이 다르다 ──▶ 고칠 파일이 다르다 (values / kustomization / CR / manifest)
        │
        ▼
앱마다 기존 주소를 쓰는 주체가 다르다 ──▶ 사람만 쓰면 교체, 기계가 쓰면 LB 유지(dual-path)
        │
        ▼
앱이 스스로 자기 URL을 만든다 ──▶ ingress만 바꾸면 링크·리다이렉트·CSRF가 깨진다
```

### 서비스별 진단 결과 요약

| 서비스 | 설치 방식 | 걸림돌 | 결정 |
| --- | --- | --- | --- |
| Headlamp | Helm | 신규 공개 노출. cluster-admin 토큰이 새면 클러스터 전체가 위험 | 첫 리트머스 테스트 대상. IP 제한·OIDC 권장 |
| Argo CD | Kustomize | argocd-server가 self-signed TLS로 서빙 | `backend-protocol: HTTPS`와 `argocd-cm.url` patch |
| Wazuh | 수동 manifest | backend가 HTTPS | ingress host 교체 + `server.publicBaseUrl` |
| Grafana | Helm | subpath 서빙, 깨진 `root_url` | host 기반 전환 + `root_url` 교정 |
| Alertmanager | Helm | 인증 없이 외부 노출 | ingress만 끄고 pod/svc는 유지 |
| AWX | Operator | API 토큰 클라이언트가 LB 주소를 씀 | LB 유지 + ingress 추가 (dual-path) |
| Harbor | Helm | `expose.type`이 배타적이라 LB와 ingress 공존 불가 | LB 반납, docker 클라이언트 전원 URL 교체 |
| Prometheus | Helm | LB가 데이터 경로 | 이번 주제와 무관 (대조군) |

## 5. 해결 — 서비스별 조치

> 원칙: **서비스 하나를 바꾸고, Go/No-Go를 통과한 뒤에만 같은 파일을 커밋**한다. 아래 값은 ingress-nginx + 와일드카드 Secret 환경 기준의 출발점이며, 그대로 복사해 쓰는 값이 아니다.

### 5-1. 공통 — 와일드카드 인증서를 네임스페이스마다 복제

Ingress의 `tls.secretName`은 **같은 네임스페이스의 Secret만** 참조할 수 있다. 그래서 원본 Secret을 대상 네임스페이스마다 같은 이름으로 복사한다.

```bash
copy_tls() {
  kubectl get secret -n <src-ns> <src-secret> -o json \
    | jq 'del(.metadata.namespace,.metadata.resourceVersion,.metadata.uid,.metadata.creationTimestamp,.metadata.annotations,.metadata.managedFields,.metadata.ownerReferences) | .metadata.name="wildcard-tls"' \
    | kubectl apply -n "$1" -f -
}
for ns in wazuh awx kube-system argocd harbor monitoring; do copy_tls "$ns"; done
```

`resourceVersion`, `uid`, `ownerReferences` 같은 메타데이터를 지우지 않으면 apply가 실패하거나 원본과 엉뚱하게 엮인다. 이 방식은 인증서를 갱신할 때 **복제본을 전부 다시 만들어야 한다**는 비용이 남는다(7장 참고).

### 5-2. HTTPS backend — Argo CD, Wazuh

Argo CD 서버와 Wazuh 대시보드는 자체 self-signed 인증서로 HTTPS를 서빙한다. ingress-nginx가 backend에 HTTP로 붙으면 응답이 깨지므로 backend 프로토콜을 명시한다.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server
  namespace: argocd
  annotations:
    nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"
    nginx.ingress.kubernetes.io/proxy-ssl-verify: "off"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [idc-argocd.example.com]
      secretName: wildcard-tls
  rules:
    - host: idc-argocd.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 443
```

`ssl-passthrough`는 쓰지 않았다. controller 기동 플래그를 바꿔야 해서 다른 서비스 전체에 영향을 준다. Argo CD는 외부 URL도 알아야 하므로 `argocd-cm`의 `url`을 **Kustomize patch로** 넣었다.

```yaml
# argocd-cm-patch.yaml — kustomization.yaml의 patches에 등록
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  url: https://idc-argocd.example.com
```

`kubectl patch cm argocd-cm`로 직접 넣으면, 다음에 `kubectl apply -k`를 다시 실행하는 순간 vendor manifest 기준으로 되돌아간다.

### 5-3. 앱의 자기 URL — Grafana 전환과 Alertmanager 차단

Grafana는 한 번의 Helm upgrade로 subpath → host 기반으로 옮기면서, 깨져 있던 `root_url`도 함께 고쳤다.

```yaml
grafana:
  grafana.ini:
    server:
      root_url: "https://idc-grafana.example.com/"   # 기존: 할당되지 않은 IP/grafana
      serve_from_sub_path: false                     # 기존: true
  ingress:
    enabled: true
    ingressClassName: nginx
    hosts: [idc-grafana.example.com]
    path: /
    tls:
      - secretName: wildcard-tls
        hosts: [idc-grafana.example.com]
    annotations:
      nginx.ingress.kubernetes.io/ssl-redirect: "true"

alertmanager:
  alertmanagerSpec:
    externalUrl: http://<ingress-vip>/alertmanager   # 그대로 둔다
    routePrefix: /alertmanager                       # 그대로 둔다
  ingress:
    enabled: false                                   # 외부 web 접근만 차단
```

Alertmanager는 **ingress만 끄고** `routePrefix`와 `externalUrl`은 남겼다. 이 값을 지우면 차트가 Prometheus의 alerting 설정을 다시 만들면서 경로 prefix가 바뀔 수 있다. pod, Service, PVC(silence 이력)는 그대로라서 알림 발송에는 영향이 없고, 꼭 봐야 할 때는 `kubectl port-forward`나 Grafana datasource로 본다.

같은 종류의 "자기 URL" 설정은 서비스마다 이름만 다르다.

| 서비스 | 설정 | 빠뜨리면 |
| --- | --- | --- |
| Grafana | `grafana.ini.server.root_url` | 알림·공유 링크가 엉뚱한 주소로 생성 |
| Argo CD | `argocd-cm.url` | UI·알림·SSO 콜백 링크 오류 |
| Wazuh | `server.publicBaseUrl` | 대시보드 내부 링크 오류 |
| AWX | `CSRF_TRUSTED_ORIGINS` | 폼 제출이 CSRF로 거부 |
| Harbor | `externalURL` | docker CLI 안내, 스캔 리포트 URL 오류 |
| Jenkins | `controller.jenkinsUrl` | webhook, 로그인 리다이렉트, 빌드 링크 오류 |

### 5-4. LB 유지 + ingress 추가 — AWX (dual-path)

AWX는 API 토큰을 쓰는 스크립트와 CLI가 기존 LB 주소를 바라보고 있을 가능성이 컸다. 그래서 LB(기계용 HTTP 경로)는 그대로 두고 ingress(사람용 HTTPS 경로)를 **추가**했다[^dual-path]. awx-operator가 ingress를 직접 관리하므로 Ingress를 손으로 만들지 않고 CR에 선언한다.

```yaml
apiVersion: awx.ansible.com/v1beta1
kind: AWX
metadata:
  name: awx
  namespace: awx
spec:
  # 기존 필드 유지 (LB 영구 유지)
  service_type: LoadBalancer
  loadbalancer_ip: <awx-vip>

  # 신규: 사람 접근용 HTTPS 경로
  hostname: idc-awx.example.com
  ingress_type: ingress
  ingress_class_name: nginx
  ingress_tls_secret: wildcard-tls
  ingress_annotations: |
    nginx.ingress.kubernetes.io/ssl-redirect: "true"

  # 신규: Django가 새 Origin을 허용하도록
  extra_settings:
    - setting: CSRF_TRUSTED_ORIGINS
      value: "['https://idc-awx.example.com']"
```

awx-operator에서 `service_type`과 `ingress_type`은 독립된 필드라서 둘 다 지정하면 LB와 Ingress가 함께 생긴다. operator 기본값이 바뀌어도 LB가 사라지지 않도록 `service_type`과 `loadbalancer_ip`는 명시적으로 남겼다. `CSRF_TRUSTED_ORIGINS` 값은 Python 리스트 리터럴 문자열이어야 한다.

### 5-5. LB 교체 — Harbor (유일하게 LB를 포기한 서비스)

Harbor Helm 차트의 `expose.type`은 `ingress` / `loadBalancer` / `nodePort` / `clusterIP` 중 하나만 고르는 값이라 dual-path가 불가능했다.

```yaml
expose:
  type: ingress
  tls:
    enabled: true
    certSource: secret
    secret:
      secretName: wildcard-tls
  ingress:
    className: nginx
    hosts:
      core: idc-harbor.example.com
    annotations:
      nginx.ingress.kubernetes.io/proxy-body-size: "0"            # 이미지 레이어는 수 GB
      nginx.ingress.kubernetes.io/proxy-request-buffering: "off"
      nginx.ingress.kubernetes.io/ssl-redirect: "true"
externalURL: https://idc-harbor.example.com
```

upgrade 순간 LB Service가 ClusterIP로 바뀌고 VIP가 반납되므로, 기존 주소로 push/pull 하던 클라이언트가 **즉시** 실패한다. 그래서 다른 Phase보다 조건을 엄격하게 걸었다.

- 기존 LB IP를 참조하는 곳 전수조사: CI 파이프라인, docker daemon `insecure-registries`, `~/.docker/config.json`, pod `imagePullSecrets`, 운영 문서
- 최소 D-1 사용자 공지, 저사용 시간대 수행
- **롤백 창은 당일**: MetalLB는 반납된 VIP를 롤백 시 다시 같은 IP로 준다는 보장이 없다. 그 사이 다른 서비스가 가져가면 되돌릴 수 없다.

### 5-6. 코드로 관리 (Git-managed Helm values)

이번 작업을 Helm 운영 방식을 정리하는 계기로 삼았다.

```bash
# 릴리스마다 values 파일 하나를 유지하고, 항상 그 파일로 upgrade 한다
helm -n kube-system upgrade headlamp headlamp \
  --repo https://kubernetes-sigs.github.io/headlamp/ \
  --version <chart-version> \
  -f headlamp/headlamp-values.yaml          # --reuse-values는 쓰지 않는다

# Go/No-Go 통과 후, 테스트에 쓴 그 파일을 그대로 커밋
git add headlamp/headlamp-values.yaml
git commit -m "feat(headlamp): enable ingress with wildcard TLS"
```

- **`--reuse-values`를 쓰지 않는다.** 클러스터에 남은 값과 Git의 값이 조금씩 어긋나기 시작하면, 나중에는 어느 쪽이 진짜인지 아무도 모르게 된다.
- **values 파일에는 chart 기본값과 다른 것만 담는다.** `helm get values --all`로 전체를 박제하면 차트를 올릴 때 새 기본값이 반영되지 않는다. override가 없던 릴리스(Headlamp)는 ingress 블록만 담은 파일로 시작했다.
- values 파일에 비밀번호·토큰 같은 민감값이 있는지 커밋 전에 확인한다.

## 6. 검증 — Phase마다 같은 스모크 테스트

| 도구 | 대상 |
| --- | --- |
| `dig` | DNS가 ingress VIP를 가리키는지 |
| `curl -I` | HTTPS 응답, HTTP → HTTPS 리다이렉트 |
| `openssl s_client` | 서버가 내보내는 인증서 체인과 만료일 |
| 기존 주소 `curl` | 옛 경로가 닫혔는지 (또는 dual-path라면 여전히 열려 있는지) |

```bash
for h in idc-headlamp idc-argocd idc-wazuh idc-grafana idc-awx idc-harbor; do
  fqdn="${h}.example.com"
  echo "=== $fqdn ==="
  echo -n "DNS: ";        dig +short "$fqdn"
  echo -n "HTTPS: ";      curl -skI "https://$fqdn" | head -1
  echo -n "HTTP→HTTPS: "; curl -sI  "http://$fqdn"  | head -1
  echo -n "Cert: ";       echo | openssl s_client -connect "$fqdn:443" -servername "$fqdn" 2>/dev/null \
                            | openssl x509 -noout -subject -enddate
done
curl -sI http://<prometheus-vip>:9090/-/ready | head -1   # 대조군: 데이터 경로 유지
```

| 서비스 | 변경 전 | 변경 후 |
| --- | --- | --- |
| Headlamp | 외부 접근 불가 | `HTTP/2 200`, 와일드카드 인증서 체인 확인 |
| Argo CD | sslip host, HTTP | `HTTP/2 200`, CLI `argocd login --grpc-web` 성공 |
| Wazuh | sslip host, HTTP | `HTTP/2 302` (로그인 리다이렉트, 정상) |
| Grafana | `/grafana` subpath, 깨진 링크 | 새 host로 응답, 옛 `/grafana`는 404, 알림 링크 정상 |
| Alertmanager | `/alertmanager` 무인증 노출 | 외부 404, pod `Running 2/2`, port-forward로 `/-/ready` OK |
| AWX | LB HTTP만 | ingress HTTPS 추가, LB도 그대로 응답 |
| Harbor | LB VIP | ingress HTTPS, LB 반납 |
| Prometheus (대조군) | LB | LB 그대로 `200` |

## 7. 단기 vs 장기 개선책

| 구분 | 조치 | 비고 |
| --- | --- | --- |
| 단기 (남은 작업) | Jenkins를 `idc-jenkins`로 전환 | 인증서 Secret 복제, `controller.jenkinsUrl` 신설, webhook URL 재등록 |
| 단기 | 쓰지 않는 DNS 레코드(`idc-prometheus`, `idc-alertmanager`) 삭제 요청 | 남아도 404라 무해하지만 혼선 방지 |
| 단기 | 신규 공개 노출 서비스의 기본 비밀번호·초기 admin secret·anonymous 접근 점검 | Grafana, Argo CD, Headlamp |
| 장기 | cert-manager + Secret 복제 도구(reflector 등) 도입 | 지금은 인증서 갱신 때 복제본을 전부 손으로 다시 만들어야 한다 |
| 장기 | oauth2-proxy로 사람 접근 인증 일원화 | Headlamp 우선. 그 뒤 Alertmanager 재노출 검토 |
| 장기 | values·스크립트 안의 평문 민감값을 Secret 참조로 분리 | sealed-secrets / external-secrets / chart의 `existingSecret` |
| 장기 | Git-managed values가 안정되면 Argo CD Application으로 넘겨 자동 reconcile | GitOps |

## 8. 지속 가능한 운영

- **모니터링**: 와일드카드 인증서 만료일을 알림으로 건다. 원본 하나가 아니라 **복제본이 7개 네임스페이스에 흩어져 있어서**, 갱신할 때 하나라도 빠뜨리면 그 서비스만 조용히 만료된다. ingress-nginx access log가 로그 수집기로 들어가는지도 확인한다.
- **표준화**: 새 서비스를 노출할 때는 3장의 네 가지(설치 방식, 기존 노출, backend 프로토콜, 앱의 자기 URL)를 체크리스트로 쓴다. 사내 전용이면 `whitelist-source-range` annotation으로 IP를 제한한다.
- **피드백 루프**: 서비스별 설치 문서에 "어느 파일을 고쳐 어떻게 반영하는지"와 "사람은 도메인 주소, 스크립트는 LB 주소"를 명시했다. 다음 사람이 `kubectl patch`로 우회하지 않게 하는 것이 목적이다.

## 마무리

- 이번 작업의 핵심은 "노출 경로를 통일하는 일은 ingress를 바꾸는 일이 아니라, 서비스마다 다른 원본 파일과 앱이 스스로 아는 자기 URL을 맞추는 일"이라는 것이다.
- 계획서의 전제("Grafana는 ClusterIP")가 실제와 달랐다. 실행 직전의 재조사 덕분에 인증 없이 열려 있던 Alertmanager를 찾아 닫았고, 오래 깨져 있던 Grafana 링크도 고쳤다.
- 다음에 비슷한 통합 작업("이것도 도메인으로 붙여 주세요")을 만나면: `설치 방식 확인` → `기존 주소 사용자 파악(LB 유지 여부)` → `backend 프로토콜 확인` → `앱의 자기 URL 설정` 순으로 확인한다.

### 예상 질문

- **Q. 그냥 LB를 전부 없애고 ingress 하나로 모으면 더 깔끔하지 않나?** 깔끔하지만 LB 주소를 쓰는 에이전트·스크립트·datasource를 전부 찾아 바꿔야 한다. 다 찾았다는 보장이 없으므로, 공존이 가능한 서비스(AWX, Prometheus)는 LB를 남겼다. 공존이 불가능한 Harbor만 비용을 치르고 교체했다.
- **Q. ArgoCD는 `--insecure`로 HTTP 서빙하게 바꾸는 게 더 단순하지 않나?** 그 방법도 있지만 argocd-server 설정을 바꿔야 한다. ingress annotation(`backend-protocol: HTTPS`)만으로 해결하면 앱은 그대로 두고 ingress 쪽에서 되돌릴 수 있다. Wazuh와 같은 패턴이라 운영 일관성도 생긴다.
- **Q. Alertmanager를 지우지 않고 ingress만 끈 이유는?** Prometheus는 클러스터 내부 Service로 Alertmanager에 알림을 보낸다. 외부 web 접근만 필요 없었을 뿐 알림 경로는 필요했다. ingress만 끄면 외부 노출은 사라지고, 알림 발송과 silence 이력은 그대로 남는다.
- **Q. 와일드카드 인증서를 이렇게 복제해도 되나?** 동작은 하지만 갱신 때 사람이 빠뜨릴 위험이 생긴다. 그래서 만료 알림과 cert-manager 도입을 장기 과제로 남겼다. 와일드카드 키가 여러 네임스페이스에 퍼지므로, 그 네임스페이스의 Secret 조회 권한도 함께 관리해야 한다.

---

**참고자료**

- [Ingress-Nginx Annotations](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/) — `backend-protocol`, `proxy-ssl-verify`, `proxy-body-size`, `whitelist-source-range` 동작을 참고했다.
- [Argo CD — Ingress Configuration](https://argo-cd.readthedocs.io/en/stable/operator-manual/ingress/) — argocd-server를 ingress-nginx 뒤에 둘 때 TLS 처리 방식 비교를 참고했다.
- [goharbor/harbor-helm](https://github.com/goharbor/harbor-helm) — `expose.type`, `externalURL` 값의 의미를 참고했다.
- [ansible/awx-operator](https://github.com/ansible/awx-operator) — AWX CR의 `service_type`, `ingress_type`, `extra_settings` 필드를 참고했다.
- [Grafana — Configure Grafana (root_url)](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/#root_url) — `root_url`, `serve_from_sub_path`의 역할을 참고했다.

[^sslip]: [sslip.io](http://sslip.io/)는 호스트명 안에 IP를 적으면 그 IP로 응답해 주는 공개 DNS 서비스다. 예를 들어 `app.10-0-0-1.sslip.io`는 `10.0.0.1`로 풀린다. DNS 등록 없이 ingress host 규칙을 바로 쓸 수 있어 테스트에는 편하지만, 정식 도메인이 아니라서 공인 인증서를 붙이기 어렵고 주소에 IP가 박혀 있어 VIP가 바뀌면 주소도 바뀐다. 그래서 "임시로 붙여 둔 주소"가 그대로 운영 주소가 되기 쉽다.
[^dual-path]: 같은 서비스로 들어오는 길을 용도별로 두 개 두는 설계다. 스크립트·에이전트·CLI처럼 주소가 코드나 설정에 박혀 있는 **기계**는 기존 LB 주소(HTTP)를 그대로 쓰고, 브라우저로 들어오는 **사람**은 새 도메인(HTTPS)을 쓴다. 외부 설정을 하나도 바꾸지 않고 사람 쪽 경험만 개선할 수 있다. 대신 MetalLB VIP 하나를 계속 점유하고, 문서에 "어느 주소를 누가 쓰는지"를 분명히 적어 두지 않으면 혼선이 생긴다. LB 경로가 사내망 전용이라는 전제가 깨지지 않도록 LB 쪽 접근 통제도 따로 챙겨야 한다.
