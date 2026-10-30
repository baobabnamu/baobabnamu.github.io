---
isDraft: true
headline: "k8s-master ingress 전환 작업 로그 — Phase 0 · Phase 3 완료 (idc-wazuh.gabia.io 적용)"
subHeadline: "와일드카드 TLS secret 6개 ns 복제 + Wazuh Dashboard sslip→gabia.io 전환 실전 기록"
excerpt: "mailchk 네임스페이스에 보관된 *.gabia.io 와일드카드 인증서를 6개 네임스페이스에 복제하고, Wazuh Dashboard ingress를 sslip에서 idc-wazuh.gabia.io HTTPS로 전환한 작업 기록."
category: "OPS"
publishDate: 2026-10-30
lastModifiedDate: 2026-10-30
---

## 배경

k8s-master 클러스터의 웹 UI/대시보드 8개를 `idc-<service>.gabia.io` + HTTPS로 통합 노출하는 전환 작업의 첫 두 Phase가 완료되었다. 전체 계획 및 설계 취지는 앞서 게시한 [k8s-master ingress-nginx: sslip.io → *.gabia.io 서브도메인 분리 및 HTTPS 전환 계획](https://app.notion.com/p/40918fdf38ed81a79662f6a8810f3acd) 포스트를 참고.

이 포스트는 실제 실행한 미엑션과 검증 결과를 남기는 작업 로그.

## Phase 0 — 와일드카드 TLS secret 복제 (6개 ns)

### 상황

`*.gabia.io` 와일드카드 인증서(Sectigo OV R36, 만료 2027-04-10)가 이미 `mailchk/mailchk-web-tls` 에 존재. cert-manager/reflector 미설치 상태에서는 **네임스페이스마다 secret을 직접 복제**해야 ingress TLS 가 작동. 7개 대상 네임스페이스(wazuh, awx, kube-system, argocd, harbor, monitoring)에 `wildcard-gabia-tls` 로 복제.

### 실행

```bash
copy_tls() {
  kubectl get secret -n mailchk mailchk-web-tls -o json \
    | jq 'del(.metadata.namespace,.metadata.resourceVersion,.metadata.uid,.metadata.creationTimestamp,.metadata.annotations,.metadata.managedFields,.metadata.ownerReferences) | .metadata.name="wildcard-gabia-tls"' \
    | kubectl apply -n "$1" -f -
}
for ns in wazuh awx kube-system argocd harbor monitoring; do copy_tls "$ns"; done
```

`jq` 로 `metadata.namespace / resourceVersion / uid / creationTimestamp / annotations / managedFields / ownerReferences` 를 지우고 `metadata.name` 만 `wildcard-gabia-tls` 로 교체 후 대상 ns 에 `apply`. `kubectl apply` 나 망등성이 있어 재실행도 안전.

### 검증

```javascript
wazuh:       wildcard-gabia-tls type=kubernetes.io/tls  created=2026-10-30T08:40:41Z
awx:         wildcard-gabia-tls type=kubernetes.io/tls  created=2026-10-30T08:40:41Z
kube-system: wildcard-gabia-tls type=kubernetes.io/tls  created=2026-10-30T08:40:42Z
argocd:      wildcard-gabia-tls type=kubernetes.io/tls  created=2026-10-30T08:40:42Z
harbor:      wildcard-gabia-tls type=kubernetes.io/tls  created=2026-10-30T08:40:43Z
monitoring:  wildcard-gabia-tls type=kubernetes.io/tls  created=2026-10-30T08:40:43Z
```

6개 ns 전부 `kubernetes.io/tls` 타입으로 동일 시간대(2초 안)에 생성 → 루프 정상 실행.

샘플 cert 체인 (wazuh ns):

```javascript
subject=C = KR, ST = Gyeonggi-do, O = "Gabia,Inc.", CN = *.gabia.io
issuer =C = GB, O = Sectigo Limited, CN = Sectigo Public Server Authentication CA OV R36
notBefore=Mar 10 00:00:00 2026 GMT
notAfter =Apr 10 23:59:59 2027 GMT
```

> 초기 플랜에서는 cert 발급 등급을 "DV R36" 으로 적었으나, 실제는 **OV R36** (Organization Validated, Subject 에 `O=Gabia,Inc.` 포함). 보안 등급은 OV > DV, 실행에 영향 없음.

### 영향 범위

1. 전체 작업 중 가장 안전한 단계 — Secret은 생성만 된 상태로 돌아가는 ingress 가 없어서 사용자가 체감할 변화는 전무.

## Phase 3 — Wazuh Dashboard sslip → [idc-wazuh.gabia.io](http://idc-wazuh.gabia.io/)

### 상황

기존 ingress `wazuh/wazuh-dashboard`:

```javascript
host:      wazuh.211-234-124-7.sslip.io
backend:   dashboard:443 (HTTPS)
TLS:       없음 (평문)
```

Ingress-nginx 에서 TLS 종단할 수 있도로록 host 교체 + `wildcard-gabia-tls` secret 연결.

### 실행

기존 ingress 백업 후 신규 매니페스트로 `apply`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: wazuh-dashboard
  namespace: wazuh
  annotations:
    nginx.ingress.kubernetes.io/backend-protocol: HTTPS
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-ssl-verify: "off"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [idc-wazuh.gabia.io]
      secretName: wildcard-gabia-tls
  rules:
    - host: idc-wazuh.gabia.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: dashboard
                port:
                  number: 443
```

Wazuh Dashboard 는 자체 TLS 로 serve 하므로 `backend-protocol: HTTPS` + 내부 self-signed 기본동작에 맞춰 `proxy-ssl-verify: off`. OpenSearch Dashboards 의 쿼리/대시보드 로딩이 다말 길게 만드는 세션을 고려해 `proxy-read/send-timeout: 3600`.

### 검증

```javascript
$ curl -skI https://idc-wazuh.gabia.io
HTTP/2 302
date: Fri, 30 Oct 2026 09:11:39 GMT
content-length: 0
location: /app/login?
osd-name: wazuh-dashboard-6c5b68cdf7-m5kp4
```

`HTTP/2 302 → /app/login?` 는 Wazuh Dashboard 의 정상 로그인 리다이렉트. 응답 헤더의 `osd-name: wazuh-dashboard-6c5b68cdf7-m5kp4` 는 **실제 OpenSearch Dashboards pod 나머 지** 을 말하므로 백업엔드 연결이 끝까지 정상임을 확인.

인증서 체인:

```javascript
$ echo | openssl s_client -connect idc-wazuh.gabia.io:443 \
       -servername idc-wazuh.gabia.io 2>/dev/null | openssl x509 -noout -subject -issuer -enddate
subject=C = KR, ST = Gyeonggi-do, O = "Gabia,Inc.", CN = *.gabia.io
issuer =C = GB, O = Sectigo Limited, CN = Sectigo Public Server Authentication CA OV R36
notAfter=Apr 10 23:59:59 2027 GMT
```

## 작업 중 발견한 특이사항

- **인증서 등급**: 미리 만들어둔 플랜에서 "DV R36"으로 기록했는데 실제는 OV R36. Subject 에 `O=Gabia,Inc.` 포함. CT 로그에 이미 기록된 호스트 명이 곧 공개되는 사실 자각 필요.
- **검증은 서버 측에서**: 사양 네트워크에서는 `211.234.124.7` (IDC MetalLB VIP) 로 라우팅이 없어 로컬 마신에서 `curl https://idc-wazuh.gabia.io` 는 timeout. **SSH 로 k8s-master 에 들어가 서버 쪽에서 curl/openssl 실행** 해야 링크를 거칠 수 있음. (SSH ControlMaster 세션 재사용 없으면 비밀번호 매번 입력이 번거로움 — 관련 포스트에 상세 기록)
- **helm label 없는 기존 ingress**: wazuh-dashboard ingress 는 `last-applied-configuration` annotation 만 있고 helm 라벨이 없음. 즉 Helm chart 관리가 아닌 수동 apply — helm upgrade 로 revert 될 걸정 없음. kubectl apply 로 로컬한 변경이 안전.

## 남은 작업

| Phase | 서비스 | 처리 방식 | 상태 |
| --- | --- | --- | --- |
| 1 | [idc-headlamp.gabia.io](http://idc-headlamp.gabia.io/) | Helm values upgrade (release `idc-headlamp`) | 대기 |
| 2 | [idc-argocd.gabia.io](http://idc-argocd.gabia.io/) | 수동 ingress + argocd-cm url 반영 | 대기 |
| 4 | idc-grafana / idc-alertmanager / idc-prometheus | Helm values upgrade (release `prometheus-stack`) + basic-auth 선행 | 대기 |
| 5 | [idc-awx.gabia.io](http://idc-awx.gabia.io/) | awx-operator CR patch | 대기 |
| 6 | [idc-harbor.gabia.io](http://idc-harbor.gabia.io/) | Helm values upgrade (release `harbor`, expose.type=ingress) | 대기 (D-1 공지 필요) |
| 7 | LB VIP 반납 (prometheus/awx) | D+7 안정화 후 | 대기 |

## 교훈

- 사전 에 상세 플랜을 만들고 **매 Phase 마다 Go/No-Go 게이트를 두니** 실행 중 남은 일을 착각하지 않았다. Phase 3 생산성은 TLS secret 복제 + ingress 교체 두 커밋 10분 내.
- **생성 직후 응답 헤더**(`osd-name`, `location`) 확인은 단순 curl 단위로도 많은 것을 말해 준다 — 404/500 없이 바로 리다이렉트 나오면 ingress-nginx가 백업엔드에 제대로 도달했다는 뜨. SSL handshake 이상은 openssl 유연으로 읽는 게 가장 직관적.
- **IDC VIP 네트워크 격리**: 사양 네트워크에서는 도달할 수 없는 대상이라, 검증은 서버 측으로 들어가 수행해야 함을 Phase 1 전에 충분히 내장화해 두기.

다음 작업들은 Phase 1(headlamp, 영향 0) 또는 Phase 2(argocd, 영향 0) 부터 들어가며, 안정성 검증 후 현 Helm 정책으로 전요 일정 운영.

## 참고 포스트

- 최초 설계 플랜: [k8s-master ingress-nginx: sslip.io → *.gabia.io 서브도메인 분리 및 HTTPS 전환 계획](https://app.notion.com/p/40918fdf38ed81a79662f6a8810f3acd)
- SSH 접근 방식 분석: [Claude Code에서 비밀번호 SSH 서버를 조회하기 — OpenSSH ControlMaster 세션 재사용 기법](https://app.notion.com/p/40918fdf38ed81698d6ffbf1f22d9b65)
