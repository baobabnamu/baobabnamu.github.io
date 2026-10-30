---
isDraft: true
headline: "Claude Code에서 비밀번호 SSH 서버를 조회하기 — OpenSSH ControlMaster 세션 재사용 기법"
subHeadline: "Bash 도구의 TTY 제약을 로컬 소켓 멀티플렉싱으로 우회한 실전 사례"
excerpt: "Claude Code의 Bash 도구는 대화형 비밀번호 입력을 지원하지 않는다. 사용자가 로컬 터미널에서 열어둔 OpenSSH ControlMaster 소켓을 Claude가 재사용함으로써 비밀번호 없이 원격 kubectl 조회를 수행한 접근 방식 분석."
category: "OPS"
publishDate: 2026-10-30
lastModifiedDate: 2026-10-30
---

## 문제 상황

Claude Code 세션에서 사내 k8s-master(`211.234.124.36`)의 ingress 구성을 조사해야 했다. 접근 조건:

- SSH 키 등록 없이 비밀번호 인증만 허용된 서버
- 사용자는 Claude에게 비밀번호를 노출하고 싶지 않음 ("비밀번호는 내가 직접 입력하게 해줘")
- Claude가 10개 이상의 kubectl 조회를 수행해야 함

## Claude Code Bash 도구의 TTY 제약

Claude Code의 Bash 도구는 명령을 비대화형으로 실행한다. 명시적으로 `!` 프리픽스를 쓰면 사용자 쪽 쉘에서 실행되지만, 이 경로도 Claude Code 하네스를 경유하기 때문에 완전한 PTY가 붙지 않는다.

이게 왜 문제인가? OpenSSH는 비밀번호를 **표준 입력이 아니라 `/dev/tty` 에서 직접 읽는다**. 제어 터미널이 없으면 비밀번호 프롬프트가 사용자에게 도달하지 못하거나, 도달해도 입력이 전달되지 않는다.

## 실패한 시도들

### 시도 1: `-fN` 백그라운드 ControlMaster

```javascript
!ssh -o ControlMaster=yes -o ControlPath=/tmp/ssh-k8s-master.sock \
     -o ControlPersist=30m -fN gm2502044@211.234.124.36
```

결과:

```javascript
Permission denied, please try again.
Permission denied, please try again.
Received disconnect from 211.234.124.36 port 22:2: Too many authentication failures
```

원인: 사용자 로컬 환경에 ssh-agent로 로드된 공개키들이 서버의 `MaxAuthTries` 를 초과해 거부당했고, 비밀번호 프롬프트까지 도달하지 못했다. 공개키 거부 자체가 "인증 시도 1회"로 계산된다.

### 시도 2: 공개키 완전 비활성화

```javascript
!ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no \
     -o ControlMaster=yes -o ControlPath=/tmp/ssh-k8s-master.sock \
     -o ControlPersist=30m -fN gm2502044@211.234.124.36
```

결과: 동일하게 `Permission denied`. 공개키 문제는 사라졌지만 이번엔 **`-fN` + no-TTY** 조합이 비밀번호 입력을 못 받는 상태였다. `-fN` 은 "인증 완료 후 백그라운드로 분기, 원격 명령은 실행하지 않음" 이라, 인증(=비밀번호 프롬프트) 자체가 TTY를 요구한다.

## 해결책: 사용자가 실제 터미널에서 Master 세션을 유지

발상 전환:

> "인증을 하는 쪽(TTY 필요)" 과 "명령을 실행하는 쪽(TTY 불필요)" 을 분리하자.

절차:

1. **사용자**가 Claude Code 밖의 **일반 터미널** 창에서 다음을 실행:
  ```javascript
  ssh -o ControlMaster=yes -o ControlPath=/tmp/ssh-k8s-master.sock \
      -o ControlPersist=1h gm2502044@211.234.124.36
  ```

  정상적인 PTY에서 비밀번호 입력 → 원격 쉘 획득 → 창을 그대로 둠.
2. 이 시점에 로컬 머신(`/tmp/ssh-k8s-master.sock`)에 UNIX 도메인 소켓이 생성됨:
  ```javascript
  srw-------  1 bao aiops  0 Oct 30 15:28 /tmp/ssh-k8s-master.sock
  ```
3. **Claude**는 Bash 도구로 다음과 같이 실행:
  ```bash
  ssh -o ControlPath=/tmp/ssh-k8s-master.sock -O check gm2502044@211.234.124.36
  # → Master running (pid=2578687)

  ssh -o ControlPath=/tmp/ssh-k8s-master.sock gm2502044@211.234.124.36 \
      'kubectl get ingress -A -o wide'
  ```

  `ControlPath` 가 가리키는 소켓에 연결 가능하면, OpenSSH는 **새 TCP/TLS 핸드셰이크도 재인증도 하지 않고** 기존 마스터 세션의 멀티플렉스 채널을 통해 명령만 전달한다.

## 작동 원리: OpenSSH Connection Multiplexing

`ControlMaster`/`ControlPath`/`ControlPersist` 세 가지 옵션은 OpenSSH의 **연결 다중화(connection multiplexing)** 기능을 구성한다.

- **ControlMaster=yes** — 이 프로세스를 마스터로 지정. UNIX 도메인 소켓을 `ControlPath` 위치에 바인드.
- **ControlPath=/path/to/sock** — 다른 ssh 프로세스가 이 소켓을 발견하면, 신규 연결 대신 마스터에게 "내 명령을 네 세션 위에 얹어라" 라고 요청한다.
- **ControlPersist=1h** — 원래의 포그라운드 ssh 명령이 끝나도 마스터 프로세스를 1시간 더 백그라운드로 유지.

마스터는 이미 인증이 끝난 상태의 SSH 세션을 쥐고 있기 때문에, 뒤이어 붙는 클라이언트는 **인증 과정을 완전히 생략**한다. 키 교환도 없다. 이게 TTY 요구가 사라지는 이유다.

## 이 접근이 유효한 조건

- 사용자와 Claude가 **같은 로컬 머신**에서 동작해야 한다. 소켓은 로컬 파일시스템 리소스이기 때문에 네트워크를 넘지 못한다. Claude Code 데스크톱/CLI는 사용자 머신에서 돌아가므로 성립.
- 소켓 파일 권한이 Claude 프로세스에서 접근 가능해야 한다. 보통 `0600`이지만 같은 UID면 OK.
- 서버의 `MaxSessions` (sshd 기본 10) 안에서 멀티플렉스 세션 수가 제한된다. 조회 10개 정도는 문제 없음.
- 마스터 세션의 유휴 타임아웃이나 서버의 `ClientAliveInterval` 로 인해 끊기지 않도록 `ControlPersist` 를 넉넉히 잡는다.

## 보안 측면

- **비밀번호 노출 범위**: 비밀번호 입력은 사용자 로컬 터미널 안에서만 발생. Claude Code 세션 로그에 남지 않는다.
- **권한 상승 위험**: 소켓이 열려 있는 동안 로컬에서 같은 UID로 실행되는 임의 프로세스는 그 소켓을 통해 서버에 명령을 실행할 수 있다. 조사 종료 후 `ssh -O exit -o ControlPath=... <host>` 로 닫는 것이 바람직.
- **감사 추적**: 서버 입장에서는 모든 명령이 하나의 SSH 세션 안에서 수행된 것으로 보인다. (`last` 로그는 1건, `~/.bash_history` 는 ssh 실행된 원격 명령별로 분리되지 않을 수 있음)

## Claude 쪽 관점에서의 교훈

- Bash 도구에서 비밀번호나 OTP가 필요한 상황은 **인증을 외부화** 하는 패턴으로 돌파하는 게 깔끔하다. ControlMaster 외에도 `gcloud auth login`, `kubectl config` 같이 사용자가 미리 로그인/토큰을 발급해 두는 흐름이 모두 같은 패턴.
- `!` 프리픽스 실행이 "쉘에서 돌아가니까 뭐든 될 것" 이라고 가정하면 안 된다. 하네스 경유 과정에서 PTY/stdin 처리가 평범한 터미널과 다르다.
- 실패하는 시도를 반복할 때는 **에러 메시지의 의미** 를 꼼꼼히 읽어야 한다. 이번 케이스에서 `Too many authentication failures` 는 "비밀번호가 틀렸다" 가 아니라 "비밀번호 프롬프트에 도달하지 못했다" 는 전혀 다른 신호였다.

## 요약 (TL;DR)

```javascript
# 사용자 (일반 터미널 창)
ssh -o ControlMaster=yes -o ControlPath=/tmp/sock -o ControlPersist=1h user@host

# Claude (Bash 도구)
ssh -o ControlPath=/tmp/sock user@host '<any command>'
```

SSH 멀티플렉싱 소켓을 공유해 "인증은 사람, 조회는 자동화" 를 분리한다. 이번 조사는 이 패턴 위에서 10여 개의 `kubectl` 명령으로 ingress-nginx 구성 전체를 비밀번호 한 번만 입력하고 끝냈다.
