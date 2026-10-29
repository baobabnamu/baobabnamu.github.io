---
isDraft: true
headline: "인프라 스터디 (10월 4주차) - Apache가 실제로 사용 중인 PHP 모듈을 확인하는 방법 학습"
subHeadline: "프로세스 → 설치 패키지 → 로드된 모듈 순으로 좁혀, 여러 PHP 연동 방식 중 Apache가 지금 쓰는 것을 가려내는 절차"
excerpt: "ps, dpkg, apache2ctl -M으로 Apache 프로세스와 설치된 PHP 패키지, 로드된 모듈을 확인하고, 모듈이 여러 개일 때 실제로 PHP 요청을 처리하는 핸들러를 판별하는 방법"
category: "OPS"
publishDate: 2026-10-29
---

## 개요

- **목적**: Debian/Ubuntu 계열 서버에서 Apache가 PHP를 어떤 방식(mod_php / PHP-FPM / mod_fcgid)으로 실행하는지 확인한다.
- **확인 순서**: 프로세스 → 설치된 패키지 → Apache가 로드한 모듈 순으로 범위를 좁힌다. 모듈이 여러 개 로드돼 있으면 핸들러 설정과 실제 요청으로 최종 판별한다.

```text
ps -ef | grep apache   →   dpkg -l | grep php   →   apache2ctl -M | grep -Ei 'php|proxy_fcgi|fcgid'
(Apache 실행 여부)          (설치된 PHP 패키지)        (Apache가 로드한 모듈)
                                                            │
                                                            ▼
                                          모듈이 여러 개면 → 핸들러 설정 + php_sapi_name()
```

Apache와 PHP를 연결하는 방식은 크게 세 가지다.

| 방식 | PHP가 실행되는 곳 | Apache 모듈 | 관련 패키지 |
| --- | --- | --- | --- |
| mod_php | Apache 프로세스 내부 | `php_module` (PHP 7은 `php7_module`) | `libapache2-mod-phpX.Y` |
| PHP-FPM | 별도 `php-fpm` 프로세스 (FastCGI) | `proxy_fcgi_module`, `proxy_module` | `phpX.Y-fpm` |
| mod_fcgid | Apache가 띄우는 `php-cgi` 프로세스 (FastCGI) | `fcgid_module` | `libapache2-mod-fcgid`, `phpX.Y-cgi` |

**패키지가 설치돼 있다는 것과 Apache가 그 방식을 쓰고 있다는 것은 다르다.** 그래서 패키지 → 모듈 → 핸들러 순으로 한 단계씩 확인한다.

## 1. Apache 프로세스 확인 — ps -ef

```bash
ps -ef | grep apache
```

```text
root       812     1  0 10:02 ?        00:00:01 /usr/sbin/apache2 -k start
www-data   815   812  0 10:02 ?        00:00:00 /usr/sbin/apache2 -k start
www-data   816   812  0 10:02 ?        00:00:00 /usr/sbin/apache2 -k start
root      2301  2210  0 10:15 pts/0    00:00:00 grep --color=auto apache
```

- **부모 프로세스**: `root`로 뜬 `/usr/sbin/apache2` 하나(PPID 1)가 설정을 읽고 자식을 관리한다.
- **자식 프로세스**: `www-data`로 뜬 프로세스들이 실제 요청을 처리한다. mod_php라면 PHP도 이 프로세스 안에서 실행된다.
- **마지막 줄**: `grep` 명령 자신이다. `ps -ef | grep [a]pache`로 쓰면 이 줄이 빠진다.

Debian/Ubuntu의 프로세스 이름은 `apache2`다. RHEL 계열은 `httpd`이므로 `grep apache`에 걸리지 않는다.

## 2. 설치된 PHP 패키지 확인 — dpkg -l

```bash
dpkg -l | grep php
```

```text
ii  libapache2-mod-php8.1   8.1.2-1ubuntu2.19   amd64   server-side, HTML-embedded scripting language (Apache 2 module)
ii  php-common              2:92ubuntu1         all     Common files for PHP packages
ii  php8.1-cli              8.1.2-1ubuntu2.19   amd64   command-line interpreter for the PHP scripting language
ii  php8.1-common           8.1.2-1ubuntu2.19   amd64   documentation, examples and common module for PHP
ii  php8.1-fpm              8.1.2-1ubuntu2.19   amd64   server-side, HTML-embedded scripting language (FPM-CGI binary)
ii  php8.1-mysql            8.1.2-1ubuntu2.19   amd64   MySQL module for PHP
```

이 서버에는 `libapache2-mod-php8.1`(mod_php)과 `php8.1-fpm`(PHP-FPM)이 **둘 다** 설치돼 있다. 패키지만으로는 Apache가 어느 쪽을 쓰는지 알 수 없다.

| 첫 열 | 의미 | 판단 |
| --- | --- | --- |
| `ii` | 설치됨 | 확인 대상 |
| `rc` | 패키지는 삭제됐고 설정 파일만 남음 | 사용 중이 아님 |
| `iU`, `iF` 등 | 설치·설정이 끝나지 않은 상태 | 패키지 상태부터 정리 |

> 주의: PHP 버전이 여러 개 설치돼 있으면(`php7.4-fpm`, `php8.1-fpm` 등) 연동 방식뿐 아니라 어느 버전이 쓰이는지도 따로 확인해야 한다. 버전은 3-2의 핸들러 설정(소켓 경로)에서 드러난다.

## 3. Apache가 로드한 모듈 확인 — apache2ctl -M

```bash
sudo apache2ctl -M | grep -Ei 'php|proxy_fcgi|fcgid'
```

```text
 php_module (shared)
 proxy_fcgi_module (shared)
```

`apache2ctl -M`은 현재 설정 파일 기준으로 로드되는 모듈 목록을 보여준다. 결과는 아래 셋 중 하나다.

| 출력 | 판단 |
| --- | --- |
| `php_module`만 | mod_php 사용 |
| `proxy_fcgi_module`만 | PHP-FPM 사용 (FPM 프로세스와 핸들러 설정을 추가 확인) |
| `fcgid_module`만 | mod_fcgid 사용 |
| 둘 이상 | 어느 쪽이 PHP 요청을 받는지 3-1 ~ 3-3으로 판별 |

> 주의: `apache2ctl -M`은 실행 중인 프로세스가 아니라 **디스크의 설정 파일**을 읽는다. `a2enmod`·`a2dismod` 후 재시작하지 않았다면 출력과 실제 동작이 다를 수 있다. 일반 사용자로 실행하면 로그 파일 권한 오류가 날 수 있어 `sudo`를 붙인다.

### 3-1. MPM으로 1차 판별

```bash
sudo apache2ctl -M | grep -i mpm
```

```text
 mpm_prefork_module (shared)
```

mod_php는 스레드 안전하지 않아 `mpm_prefork`에서만 동작한다. 그래서 **MPM이 prefork가 아니라면 mod_php는 쓰일 수 없다.** `mpm_event`나 `mpm_worker`라면 PHP는 FPM이나 fcgid로 처리되고 있다. 반대로 `mpm_prefork`라고 해서 mod_php라고 단정할 수는 없다(prefork에서도 FPM은 동작한다).

### 3-2. 핸들러 설정 확인 — 어떤 요청이 어디로 가는가

모듈은 로드만 됐다고 쓰이는 것이 아니다. `.php` 요청을 누가 처리할지는 `SetHandler` / `AddHandler` 설정이 정한다.

```bash
sudo grep -RniE 'SetHandler|AddHandler|FCGIWrapper' /etc/apache2/mods-enabled/ /etc/apache2/conf-enabled/ /etc/apache2/sites-enabled/
```

```text
/etc/apache2/mods-enabled/php8.1.conf:2:    SetHandler application/x-httpd-php
/etc/apache2/conf-enabled/php8.1-fpm.conf:9:        SetHandler "proxy:unix:/run/php/php8.1-fpm.sock|fcgi://localhost"
/etc/apache2/sites-enabled/example.conf:14:        SetHandler "proxy:unix:/run/php/php7.4-fpm.sock|fcgi://localhost"
```

| 설정 값 | 처리하는 쪽 |
| --- | --- |
| `application/x-httpd-php` | mod_php |
| `proxy:unix:/run/php/phpX.Y-fpm.sock` 또는 `proxy:fcgi://127.0.0.1:9000` | PHP-FPM (소켓 경로의 `X.Y`가 PHP 버전) |
| `fcgid-script`, `FCGIWrapper` | mod_fcgid |

같은 파일 패턴에 핸들러가 여러 번 걸리면 **나중에 읽힌 설정이 이긴다.** Debian/Ubuntu의 `apache2.conf`는 `mods-enabled` → `conf-enabled` → `sites-enabled` 순으로 읽으므로, 가상 호스트(`sites-enabled`)에 둔 설정이 가장 우선한다. 위 예시라면 `example.conf`를 쓰는 사이트는 PHP 7.4 FPM으로 처리된다.

```bash
sudo apache2ctl -S       # 가상 호스트별로 어떤 설정 파일을 쓰는지 확인
```

### 3-3. 실제 요청으로 최종 확인 — php_sapi_name()

설정을 아무리 읽어도 해석이 애매할 때는 실제 요청을 보내 PHP에게 직접 묻는 것이 가장 확실하다.

```bash
echo '<?php echo php_sapi_name(), " ", PHP_VERSION, PHP_EOL;' | sudo tee /var/www/html/sapi-check.php
curl -s http://localhost/sapi-check.php                          # 기본 사이트
curl -s -H 'Host: example.com' http://localhost/sapi-check.php   # 특정 가상 호스트 (DocumentRoot에 맞게 파일 위치 조정)
sudo rm /var/www/html/sapi-check.php                             # 확인 후 반드시 삭제
```

```text
fpm-fcgi 8.1.2-1ubuntu2.19
```

| `php_sapi_name()` | 연동 방식 |
| --- | --- |
| `apache2handler` | mod_php |
| `fpm-fcgi` | PHP-FPM |
| `cgi-fcgi` | mod_fcgid (php-cgi) |

> 주의: 확인용 PHP 파일은 끝나면 바로 지운다. 특히 `phpinfo()` 페이지는 경로·버전·환경 변수가 그대로 노출되므로 운영 서버에 남겨 두지 않는다.

PHP-FPM으로 판별됐다면 FPM 쪽도 살아 있는지 함께 본다.

```bash
ps -ef | grep [p]hp-fpm
systemctl status php8.1-fpm
ls -l /run/php/
```

## 4. 판별 결과 요약

| 확인 단계 | mod_php | PHP-FPM | mod_fcgid |
| --- | --- | --- | --- |
| `dpkg -l` 패키지 | `libapache2-mod-phpX.Y` | `phpX.Y-fpm` | `libapache2-mod-fcgid`, `phpX.Y-cgi` |
| `apache2ctl -M` 모듈 | `php_module` | `proxy_fcgi_module` | `fcgid_module` |
| MPM | `mpm_prefork`만 가능 | 제한 없음 | 제한 없음 |
| 핸들러 | `application/x-httpd-php` | `proxy:unix:...fpm.sock` | `fcgid-script` |
| `php_sapi_name()` | `apache2handler` | `fpm-fcgi` | `cgi-fcgi` |
| 별도 프로세스 | 없음 (Apache 자식 안에서 실행) | `php-fpm` | `php-cgi` |

## 마무리

- 패키지 설치 여부(`dpkg -l`)와 모듈 로드 여부(`apache2ctl -M`)는 후보를 좁힐 뿐, 실제로 쓰이는 방식은 핸들러 설정이 정한다.
- 모듈이 여러 개 로드돼 있으면 MPM → 핸들러 설정 → `php_sapi_name()` 순으로 확인하고, 가상 호스트마다 결과가 다를 수 있다는 점을 기억한다.
- 다음에 같은 질문을 받으면: `ps -ef | grep apache` → `dpkg -l | grep php` → `apache2ctl -M` → 핸들러 grep → `php_sapi_name()` 순으로 확인한다.

### 예상 질문

- **Q. RHEL / Rocky 계열에서는 어떻게 확인하나?** 프로세스는 `ps -ef | grep httpd`, 패키지는 `rpm -qa | grep php`, 모듈은 `httpd -M`으로 본다. 핸들러 설정은 `/etc/httpd/conf.d/php.conf`에 있고, RHEL 8 이후 기본 구성은 PHP-FPM이다.
- **Q. mod_php와 PHP-FPM 모듈이 둘 다 로드돼 있으면 문제가 되나?** 요청 처리 자체는 핸들러 설정대로 한쪽만 쓰이지만, mod_php가 로드돼 있으면 Apache 자식 프로세스마다 PHP가 올라가 메모리를 쓰고 MPM이 prefork로 묶인다. 쓰지 않는 쪽은 `a2dismod` / `a2disconf`로 내리고 재시작한다.
- **Q. 모듈을 바꿨는데 apache2ctl -M에는 반영됐고 동작은 그대로다. 왜 그런가?** `apache2ctl -M`은 설정 파일을 읽을 뿐이라, 재시작(`systemctl restart apache2`)하지 않으면 실행 중인 프로세스는 이전 모듈 구성을 그대로 쓴다. MPM이나 mod_php를 바꿀 때는 reload가 아니라 restart가 필요하다.

---

**참고자료**

- [Apache HTTP Server 2.4 — httpd](https://httpd.apache.org/docs/2.4/programs/httpd.html) — `-M` 옵션이 로드된 모듈을 나열하는 방식을 참고했다.
- [Apache Module mod_proxy_fcgi](https://httpd.apache.org/docs/2.4/mod/mod_proxy_fcgi.html) — PHP-FPM 연결용 `SetHandler "proxy:unix:...|fcgi://..."` 문법을 참고했다.
- [Apache Module mod_fcgid](https://httpd.apache.org/mod_fcgid/mod/mod_fcgid.html) — `fcgid-script` 핸들러와 `FCGIWrapper` 설정을 참고했다.
- [PHP Manual — php_sapi_name](https://www.php.net/manual/en/function.php-sapi-name.php) — SAPI별 반환값(`apache2handler`, `fpm-fcgi`, `cgi-fcgi`)을 참고했다.
- [PHP Manual — Apache 2.x on Unix systems](https://www.php.net/manual/en/install.unix.apache2.php) — mod_php를 prefork MPM과 함께 써야 하는 이유를 참고했다.
