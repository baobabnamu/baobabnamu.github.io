---
isDraft: true
headline: "Jenkins 구성 방식 한눈에 정리"
subHeadline: "Jenkinsfile은 어디에 두고, 웹 UI와 YAML은 언제 쓰는가"
excerpt: "Jenkins의 Job 유형, 파이프라인 정의 위치, Declarative와 Scripted 문법, JCasC·Job DSL·Shared Library까지 구성 방식 전체를 층위별로 정리한다."
category: "DEV"
publishDate: 2026-11-05
---

Jenkins를 처음 접하면 "파이프라인을 웹 화면에서 만들어야 하나, Jenkinsfile을 써야 하나, YAML은 어디에 쓰나" 같은 질문이 한꺼번에 생긴다. 이 혼란은 대부분 Jenkins 설정이 **여러 층위**로 나뉘어 있는데 그 구분 없이 정보를 접하기 때문이다. 이 글은 그 층위를 먼저 나누고, 각 층위에서 어떤 선택지가 있는지 정리한다.

## 1. 먼저 큰 그림: 구성은 4개 층위로 나뉜다

| 층위 | 무엇을 정의하나 | 대표 방식 |
| --- | --- | --- |
| ① Jenkins 서버 자체 | 플러그인, 보안, Credential, Agent, 전역 설정 | 웹 UI(Manage Jenkins), **JCasC(YAML)** |
| ② Job(작업) 정의 | 어떤 저장소를, 어떤 Job 유형으로, 언제 실행할지 | 웹 UI, Multibranch/Organization Folder, **Job DSL(Groovy)** |
| ③ 파이프라인 로직 | 빌드·테스트·배포의 실제 단계 | **Jenkinsfile(Groovy)** — UI 입력 또는 저장소에 커밋 |
| ④ 재사용 코드 | 여러 프로젝트가 공유하는 단계·함수 | **Shared Library(Groovy)** |

핵심은 이렇다. Jenkins에서 **파이프라인 로직(③)은 YAML이 아니라 Groovy 기반 Jenkinsfile**로 쓴다. YAML이 등장하는 곳은 주로 **서버 설정(①)의 JCasC**와 **Kubernetes Agent의 Pod 정의**다. GitHub Actions나 GitLab CI처럼 "파이프라인 = YAML"인 도구와 가장 크게 다른 점이다.

## 2. Job 유형: 무엇으로 만들 것인가

Jenkins에서 "New Item"을 누르면 보이는 주요 유형이다.

| 유형 | 특징 | 언제 쓰나 |
| --- | --- | --- |
| Freestyle project | 웹 UI에서 체크박스·입력칸으로 단계 구성 | 아주 단순한 작업, 레거시. 신규로는 비권장 |
| Pipeline | Jenkinsfile 한 개로 하나의 파이프라인 실행 | 단일 브랜치 배포 Job, 운영용 스크립트 Job |
| Multibranch Pipeline | 저장소의 브랜치·PR을 스캔해 **Jenkinsfile이 있는 브랜치마다 Job 자동 생성** | 일반적인 애플리케이션 CI의 표준 |
| Organization Folder | GitHub Org / GitLab Group 전체 저장소를 스캔해 Multibranch Job 자동 생성 | 저장소가 많은 조직 |

Freestyle은 설정이 Jenkins 내부(XML)에만 남아 변경 이력 관리와 재현이 어렵다. 그래서 요즘은 **Pipeline 계열(Pipeline / Multibranch)을 기본**으로 잡는다.

## 3. Jenkinsfile을 어디에 작성할 것인가

Pipeline Job의 "Pipeline" 섹션에서 Definition을 두 가지 중 하나로 고른다.

### 3-1. Pipeline script (웹 UI에 직접 작성)

Job 설정 화면의 텍스트 박스에 Groovy 스크립트를 붙여 넣는 방식이다.

- 장점: 저장소 없이 바로 시험해 볼 수 있다. 문법 학습, PoC, 일회성 운영 작업에 편하다.
- 단점: 코드가 Jenkins 안에만 있다. 리뷰·이력·롤백이 안 되고, Jenkins 서버가 날아가면 같이 사라진다.

### 3-2. Pipeline script from SCM (저장소의 Jenkinsfile)

애플리케이션 저장소 루트에 `Jenkinsfile`을 커밋하고, Jenkins에는 "이 저장소의 이 경로를 읽어라"만 설정한다. 이것이 흔히 말하는 **Pipeline as Code**다.

- 장점: 코드와 파이프라인이 같이 버전 관리된다. PR로 파이프라인 변경을 리뷰할 수 있고, 브랜치마다 다른 파이프라인을 가질 수 있다.
- 단점: 수정할 때마다 커밋이 필요하다. (Replay 기능으로 일시 수정 후 재실행은 가능)

### 3-3. 어떻게 고를까

| 상황 | 권장 |
| --- | --- |
| 문법 연습, 빠른 테스트 | 웹 UI Pipeline script |
| 실제 서비스의 빌드·배포 | **저장소 Jenkinsfile + Multibranch Pipeline** |
| 저장소에 넣기 애매한 운영 작업(백업, 정기 점검 등) | 별도 "ops-jobs" 저장소에 Jenkinsfile을 모아서 관리 |

원칙은 단순하다. **오래 쓸 파이프라인은 저장소에 둔다.** 웹 UI는 연습장이다.

> 참고: 웹 UI의 "Pipeline Syntax" 링크(Snippet Generator)는 실무에서도 유용하다. 체크박스로 단계를 고르면 해당 Groovy 코드를 생성해 주므로, 그 결과를 저장소 Jenkinsfile에 붙여 넣으면 된다.

## 4. Jenkinsfile 문법: Declarative vs Scripted

Jenkinsfile은 두 가지 문법이 있다.

### Declarative Pipeline (권장)

`pipeline { }` 블록으로 시작하고 정해진 구조를 따른다. 읽기 쉽고 문법 검증이 엄격해서 실수가 적다.

```groovy
pipeline {
    agent { label 'linux' }

    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        APP_NAME = 'my-app'
    }

    triggers {
        cron('H 2 * * *')   // 매일 새벽 2시 무렵
    }

    stages {
        stage('Checkout') {
            steps { checkout scm }
        }
        stage('Build') {
            steps { sh './gradlew build' }
        }
        stage('Test') {
            steps { sh './gradlew test' }
            post {
                always { junit 'build/test-results/**/*.xml' }
            }
        }
        stage('Deploy') {
            when { branch 'main' }
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: 'deploy-key', keyFileVariable: 'KEY')]) {
                    sh 'scp -i $KEY build/libs/*.jar deploy@server:/opt/app/'
                }
            }
        }
    }

    post {
        failure { echo '빌드 실패 알림 전송' }
    }
}
```

### Scripted Pipeline

`node { }` 블록으로 시작하는 순수 Groovy 스타일이다. 반복문·조건문을 자유롭게 쓸 수 있지만 구조가 정해져 있지 않아 길어지면 읽기 어렵다.

```groovy
node('linux') {
    stage('Checkout') { checkout scm }
    stage('Build') { sh './gradlew build' }
}
```

| 구분 | Declarative | Scripted |
| --- | --- | --- |
| 시작 블록 | `pipeline { }` | `node { }` |
| 학습 난이도 | 낮음 | Groovy 이해 필요 |
| 유연성 | 정해진 구조 안에서 | 거의 무제한 |
| 권장 용도 | **대부분의 파이프라인** | 복잡한 동적 로직 |

Declarative 안에서도 `script { }` 블록을 열면 Scripted 문법을 부분적으로 쓸 수 있다. 그래서 "기본은 Declarative, 꼭 필요한 곳만 `script { }`"가 일반적인 선택이다.

## 5. YAML은 어디에 쓰이나

"Jenkins도 YAML로 파이프라인 쓸 수 있나요?"에 대한 답은 **기본적으로는 아니다**. YAML이 쓰이는 곳은 다음과 같다.

### 5-1. JCasC (Jenkins Configuration as Code) — 서버 설정용

`configuration-as-code` 플러그인을 쓰면 Jenkins 서버 설정(보안, Credential, Agent, 전역 도구, 플러그인 설정)을 YAML로 선언할 수 있다. 웹 UI "Manage Jenkins"에서 클릭하던 내용을 파일로 관리하는 것이다.

```yaml
jenkins:
  systemMessage: "Managed by JCasC"
  numExecutors: 0
  securityRealm:
    local:
      allowsSignup: false
credentials:
  system:
    domainCredentials:
      - credentials:
          - usernamePassword:
              id: "git-cred"
              username: "jenkins"
              password: "${GIT_PASSWORD}"   # 실제 값은 환경변수·Vault에서 주입
unclassified:
  location:
    url: "https://jenkins.example.com/"
```

Jenkins 서버를 새로 띄워도 같은 설정으로 복원할 수 있어서 컨테이너·Kubernetes 환경에서 특히 중요하다.

### 5-2. Kubernetes Agent의 Pod 정의

Kubernetes 플러그인을 쓰면 빌드 Agent를 Pod로 띄우는데, 이 Pod 스펙을 YAML로 적는다. YAML 자체는 Jenkinsfile 안이나 별도 파일에 들어간다.

```groovy
pipeline {
    agent {
        kubernetes {
            yamlFile 'ci/build-pod.yaml'
        }
    }
    stages {
        stage('Build') {
            steps { container('maven') { sh 'mvn -B package' } }
        }
    }
}
```

### 5-3. YAML 파이프라인 플러그인

"Pipeline as YAML" 같은 플러그인이 있긴 하지만 사용자 층이 얇고 기능이 제한적이다. 팀이 YAML 기반 CI를 강하게 원한다면, Jenkins에서 YAML을 억지로 쓰기보다 GitHub Actions·GitLab CI 같은 YAML 네이티브 도구를 검토하는 편이 현실적이다.

## 6. Job 자체도 코드로: Job DSL과 Multibranch

Jenkinsfile은 "파이프라인 내용"을 코드로 만들지만, "Job을 만드는 행위"는 여전히 웹 UI 클릭일 수 있다. 이것도 코드화하는 방법이 두 가지 있다.

- **Multibranch / Organization Folder**: Job을 따로 만들 필요 없이 저장소 스캔으로 자동 생성된다. 대부분은 이것으로 충분하다.
- **Job DSL 플러그인**: Groovy DSL로 Job 정의 자체를 코드로 작성하고, "seed job"이 이를 읽어 Job들을 생성한다. Job이 수십~수백 개이거나 정형화된 Job을 대량으로 찍어야 할 때 쓴다.

```groovy
multibranchPipelineJob('my-app') {
    branchSources {
        git {
            id('my-app')
            remote('https://git.example.com/team/my-app.git')
            credentialsId('git-cred')
        }
    }
}
```

JCasC에서 `jobs:` 항목으로 Job DSL 스크립트를 실행할 수도 있어서, **JCasC(서버) + Job DSL(Job) + Jenkinsfile(파이프라인)** 조합이면 Jenkins를 거의 전부 코드로 관리할 수 있다.

## 7. 재사용: Shared Library

프로젝트마다 비슷한 Jenkinsfile이 복사되기 시작하면 Shared Library로 공통 로직을 뺀다. 별도 Git 저장소를 만들고 Jenkins 전역 설정(또는 JCasC)에 등록한다.

```javascript
jenkins-shared-lib/
├── vars/
│   └── standardBuild.groovy   # 전역 step 처럼 호출
├── src/
│   └── org/example/Utils.groovy
└── resources/
```

각 프로젝트의 Jenkinsfile은 이렇게 짧아진다.

```groovy
@Library('jenkins-shared-lib') _
standardBuild(appName: 'my-app', deployBranch: 'main')
```

공통 로직 변경을 한 곳에서 할 수 있는 대신, 라이브러리 변경이 모든 프로젝트에 영향을 주므로 **버전(태그) 고정**을 습관화하는 것이 좋다. 예: `@Library('jenkins-shared-lib@v1.2.0')`.

## 8. 함께 알아야 할 구성 요소

### Controller와 Agent

- **Controller**: 웹 UI, 스케줄링, 설정 저장을 담당한다. 보안과 안정성을 위해 Controller에서는 빌드를 돌리지 않는 것이 권장된다(executor 0).
- **Agent**: 실제 빌드가 실행되는 곳. 고정 VM(SSH Agent), Docker 컨테이너, Kubernetes Pod 등으로 구성하고 `label`로 구분해 Jenkinsfile의 `agent { label '...' }`에서 고른다.

### 트리거

| 방식 | 설명 |
| --- | --- |
| Webhook | Git 서버가 push·PR 이벤트를 Jenkins로 알림. **권장** |
| pollSCM | Jenkins가 주기적으로 저장소 변경을 확인. Webhook이 불가능할 때 |
| cron | 정해진 시간 실행. 야간 빌드, 정기 작업 |
| upstream | 다른 Job 완료 후 실행 |

### Credential

비밀번호·SSH 키·토큰은 Jenkinsfile에 직접 쓰지 않고 Jenkins Credential에 저장한 뒤 `credentialsId`로 참조한다. 저장 자체는 웹 UI, JCasC, 또는 외부 Vault 연동으로 한다.

## 9. 추천 구성 조합

규모에 따라 이렇게 단계적으로 가져가면 무리가 없다.

| 단계 | 구성 | 적합한 상황 |
| --- | --- | --- |
| 입문 | 웹 UI로 Pipeline Job 생성 + Pipeline script | 문법 익히기, 개인 실험 |
| 기본 | **Multibranch Pipeline + 저장소 Jenkinsfile(Declarative)** | 대부분의 팀 |
| 확장 | 기본 + Shared Library + Kubernetes/Docker Agent | 프로젝트가 여러 개, 빌드 환경이 다양함 |
| 완전 코드화 | 확장 + JCasC + Job DSL, Jenkins 자체를 컨테이너로 운영 | Jenkins를 재현 가능하게 운영해야 하는 조직 |

## 10. 정리

- **파이프라인 로직은 Jenkinsfile(Groovy)로 쓰고, 저장소에 커밋한다.** 웹 UI 직접 입력은 연습용이다.
- **문법은 Declarative를 기본**으로, 복잡한 부분만 `script { }`로 보완한다.
- **YAML은 파이프라인이 아니라 Jenkins 서버 설정(JCasC)과 Kubernetes Pod 정의**에 쓴다.
- Job 생성은 **Multibranch Pipeline**으로 자동화하고, 대량이면 Job DSL을 쓴다.
- 중복 로직은 **Shared Library**로 빼고 버전을 고정한다.

이 층위 구분만 잡혀 있으면, 새로운 플러그인이나 설정 방법을 만나도 "이건 ①~④ 중 어디에 해당하는가"로 바로 위치를 잡을 수 있다.
