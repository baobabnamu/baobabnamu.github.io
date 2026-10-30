---
isDraft: true
headline: "k8s-master ingress-nginx: sslip.io → *.gabia.io 서브도메인 분리 및 HTTPS 전환 계획"
subHeadline: "기존 와일드카드 인증서 재사용으로 cert-manager 없이 HTTPS 적용하기"
excerpt: "sslip.io 호스트명으로 노출된 jenkins/wazuh ingress를 *.gabia.io 서브도메인으로 분리하고, 기존 네임스페이스에 보관된 와일드카드 인증서를 복제·재사용해 HTTPS를 적용하는 전환 계획."
category: "OPS"
publishDate: 2026-10-30
lastModifiedDate: 2026-10-30
---

## 배경

사내 k8s-master 클러스터는 ingress-nginx로 몇 개의 웹 애플리케이션을 노출하고 있는데, 지금까지는 호스트명을 `*.211-234-124-7.sslip.io` 형식으로 사용해 왔다. [sslip.io](http://sslip.io/)는 임시용으로는 편하지만:

- 서비스별 식별성이 떨어진다 (호스트명에 IP가 그대로 드러남).
- HTTPS 인증서가 없다 (평문 HTTP).
- IP가 바뀌면 호스트명도 깨진다.

이번 작업은 이걸 `*.gabia.io` 서브도메인 기반 + 와일드카드 인증서 HTTPS로 전환한다.

## 환경 조사

| 항목 | 값 |
| --- | --- |
| Kubernetes | v1.28.15 (master + node1) |
| ingress-nginx | Helm `ingress-nginx-4.14.3`, controller `v1.14.3` |
| LB IP (ingress) | `211.234.124.7` (MetalLB 할당) |
| cert-manager | 미설치 |
| 와일드카드 인증서 | `mailchk/mailchk-web-tls` 에 이미 존재 (`*.gabia.io`, Sectigo, 2027-04-10 만료) |

현재 ingress-nginx에 등록된 Ingress는 두 개뿐이다:

| Namespace | Ingress | 현재 Host | Backend |
| --- | --- | --- | --- |
| jenkins | jenkins | `jenkins.211-234-124-7.sslip.io` | `jenkins:8080` (Helm 관리) |
| wazuh | wazuh-dashboard | `wazuh.211-234-124-7.sslip.io` | `dashboard:443` (`backend-protocol: HTTPS`) |

harbor / awx / mailchk-web / prometheus / wazuh-master-lb 같은 다른 앱들은 각자 MetalLB VIP를 직접 할당받아 쓰고 있어 이번 범위 밖이다.

## 핵심 결정

1. **인증서 재발급 없음** — `mailchk/mailchk-web-tls` 가 full chain을 가진 와일드카드이므로 그대로 복제해서 쓴다.
2. **cert-manager 미도입** — 단일 cert 수명이 1년 반 이상 남았고, 자동 갱신 자동화는 후속 과제로 분리.
3. **DNS는 `211.234.124.7` 가리켜야 함** — 마스터 호스트 IP(211.234.124.36)가 아니라 ingress-nginx LB VIP. (DNS 등록은 네트워크 부서 담당)
4. **Helm 관리 애플리케이션은 values 수정** — `kubectl edit` 로 즉흥 변경하면 다음 `helm upgrade` 때 revert된다.
5. **전환기 레거시 호스트 공존** — 기존 sslip 북마크/통합 스크립트를 위해 당분간 두 host 모두 서빙.

## 실행 단계

### 1. TLS secret 복제

Secret은 네임스페이스 scope이라, 쓰려는 네임스페이스마다 복사가 필요하다.

```bash
kubectl get secret -n mailchk mailchk-web-tls -o json \
  | jq 'del(.metadata.namespace,.metadata.resourceVersion,.metadata.uid,.metadata.creationTimestamp,.metadata.annotations,.metadata.managedFields) | .metadata.name="wildcard-gabia-tls"' \
  | kubectl apply -n jenkins -f -

kubectl get secret -n mailchk mailchk-web-tls -o json \
  | jq 'del(.metadata.namespace,.metadata.resourceVersion,.metadata.uid,.metadata.creationTimestamp,.metadata.annotations,.metadata.managedFields) | .metadata.name="wildcard-gabia-tls"' \
  | kubectl apply -n wazuh -f -
```

결과: `jenkins/wildcard-gabia-tls`, `wazuh/wildcard-gabia-tls`.

### 2. Jenkins (Helm 관리)

`values.yaml` 수정 → `helm upgrade`.

```yaml
controller:
  jenkinsUrl: "https://jenkins.gabia.io"
  ingress:
    enabled: true
    ingressClassName: nginx
    hostName: jenkins.gabia.io
    tls:
      - secretName: wildcard-gabia-tls
        hosts:
          - jenkins.gabia.io
```

```bash
helm -n jenkins get values jenkins -o yaml > /tmp/jenkins-values.yaml   # 백업
# 위 변경 반영 후
helm -n jenkins upgrade jenkins jenkins/jenkins -f /tmp/jenkins-values.yaml
```

주의: `controller.jenkinsUrl` 을 꼭 바꿔야 한다. Jenkins는 리버스 프록시 뒤에서 자신의 URL을 기준으로 리다이렉트/CSRF 토큰/웹훅 URL을 만들기 때문에, 이걸 빼놓으면 UI 로그인 직후 깨진다.

### 3. Wazuh Dashboard (수동 kubectl 관리)

`last-applied-configuration` annotation만 있고 Helm 라벨은 없으니 매니페스트를 직접 apply.

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
    nginx.ingress.kubernetes.io/use-regex: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [wazuh.gabia.io]
      secretName: wildcard-gabia-tls
  rules:
    - host: wazuh.gabia.io
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

부가 확인: Wazuh Dashboard의 `opensearch_dashboards.yml` 에 `server.publicBaseUrl: https://wazuh.gabia.io` 를 반영해 두면 OIDC/링크 생성이 정상 동작한다.

### 4. 롤아웃 순서

1. **DNS 선작업** (네트워크 부서) — `jenkins.gabia.io`, `wazuh.gabia.io` → `211.234.124.7` A 레코드.
2. **Secret 복제** — 서비스 영향 0. 1번과 병렬 가능.
3. **Wazuh 먼저 적용** — ingress 교체만. 단순.
4. **Jenkins Helm upgrade** — `jenkinsUrl` 포함 반영. 저사용 시간대 선택.
5. **검증 완료 후** 레거시 sslip host 제거.

## 검증

```bash
# DNS
dig +short jenkins.gabia.io   # 211.234.124.7
dig +short wazuh.gabia.io

# HTTPS + 인증서 체인
curl -vI https://jenkins.gabia.io 2>&1 | grep -E 'HTTP/|subject:|issuer:'
openssl s_client -connect jenkins.gabia.io:443 -servername jenkins.gabia.io -showcerts </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

# HTTP→HTTPS 리다이렉트 (308 기대)
curl -sI http://jenkins.gabia.io | head -1

# ingress 상태
kubectl -n jenkins describe ingress jenkins | grep -A3 TLS
kubectl -n wazuh describe ingress wazuh-dashboard | grep -A3 TLS

# controller 로그
kubectl -n ingress-nginx logs deploy/ingress-nginx-controller --tail=200 | grep -iE 'error|tls|ssl'
```

## 롤백 전략

- Ingress 문제 시: 백업된 `/tmp/*.bak.yaml` 재적용.
- Jenkins Helm 문제 시: `helm -n jenkins rollback jenkins`.
- DNS TTL은 300초 이하로 유지해 복원 창을 짧게.

## 후속 과제

- harbor / mailchk-web / awx / prometheus / wazuh-master-lb 등 LB 직노출 서비스들을 ingress-nginx 뒤로 통합 → MetalLB VIP 소비 감소, 중앙 TLS/인증/로깅.
- cert-manager + reflector 조합으로 와일드카드 secret 자동 발급·동기화. 지금은 cert 갱신 시 네임스페이스별 수동 복제가 필요하다.
- ingress-nginx controller `--default-ssl-certificate` 지정은 ingress마다 TLS 선언을 생략할 수 있게 해주지만, 네임스페이스 분리 원칙과 어긋나 비권장.
