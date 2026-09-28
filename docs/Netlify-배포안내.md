# 로봇랜드 앱 · Netlify 배포

현재 사이트는 **https://robotland-trip.netlify.app/** 이며 GitHub `main`과 자동 배포가 연결되어 있습니다. 집에서 이어서 수정하려면 [이어서 작업하기](집에서-이어하기.md)를 먼저 보세요. 아래 연결 절차는 새 프로젝트를 만들 때 참고합니다.

## GitHub에서 연결

1. Netlify에 로그인하고 **Add new project → Import an existing project → GitHub**를 선택합니다.
2. GitHub 권한 요청에서 `cyjhahaha87-debug/robotland-day-planner` 저장소를 허용하고 선택합니다.
3. 배포할 브랜치는 `main`입니다. 저장소의 `netlify.toml`이 다음 설정을 지정합니다.

| 항목 | 값 |
|---|---|
| Build command | `node scripts/build-netlify.mjs` |
| Publish directory | `netlify-dist` |
| Functions directory | `netlify/functions` |
| Node.js | 22 |

4. 배포가 끝나면 프로젝트 이름을 원하는 이름으로 정합니다. **Customize → Manage project name and cover image**에서 변경할 수 있습니다.
5. 프로젝트가 비공개로 생성됐다면 **Publish**로 공개합니다. 학생은 Netlify나 ChatGPT 계정 없이 접속하고, 앱 안에서 반 코드로 입장합니다.

## 구글시트 연결

`구글시트-연결안내.md`대로 Apps Script를 배포한 다음, Netlify의 **Project configuration → Environment variables**에서 아래 값을 등록합니다. 현재 사이트는 설정 완료 상태입니다. 적용 범위 선택이 있다면 **Functions**와 **Production**을 포함합니다.

| 이름 | 값 |
|---|---|
| `SHEETS_API_URL` | Google Apps Script의 `/exec`로 끝나는 웹앱 URL |
| `SHEETS_BRIDGE_SECRET` | 구글시트의 로봇랜드 메뉴에서 확인한 연결 비밀키 |
| `VAPID_PUBLIC_KEY` | 공지 푸시 공개키 |
| `VAPID_PRIVATE_KEY` | 공지 푸시 개인키 · 비밀값 보호, 공개 후처리 범위 제외 |

등록 후 다시 배포합니다. 비밀키는 GitHub 파일이나 학생 화면에 넣지 않습니다. 환경변수가 없으면 지도와 휴대폰 저장은 사용할 수 있고, 반·조 공유는 연결 준비 중으로 표시됩니다.

반별 데이터는 로그인된 반을 기준으로 분리합니다. 학생은 반 코드로 입장하고, 조는 목록에서 만들기·입장·이동·나가기를 누릅니다. 교사는 자기 반의 조 배정을 변경할 수 있습니다.

## 현장 사용 전

- 서로 다른 반 코드와 두 대 이상의 휴대폰으로 공지·상황 보고·조 공유·교사 조 이동을 시험합니다.
- 새 주소에서 한 번 앱을 열어 오프라인 지도를 준비합니다. 휴대폰의 기존 주소에 저장한 계획과 로그인은 새 주소로 자동 이동하지 않습니다.
- 무료 요금제에는 월 사용량 한도가 있습니다. 학생 수와 행사 시간에 맞춰 Netlify와 Apps Script 사용량을 확인합니다.
- 공지 전용 푸시가 구현됐고 사용자 아이폰 시험 수신을 확인했습니다. [공지 알림 사용법](공지푸시-업데이트-안내.md)을 참고하세요.

이 앱은 Netlify Functions도 함께 배포해야 하므로 지도 파일만 드래그해 올리는 방식으로는 반·조 기능이 작동하지 않습니다. 위 GitHub 연결 방식을 사용하세요.

## 확인 자료

- [사이트 이름과 주소 변경](https://docs.netlify.com/manage/projects/customize-project-name-and-cover-image/)
- [Netlify 프로젝트 생성](https://docs.netlify.com/manage/projects/add-new-project/)
- [Netlify 요금](https://www.netlify.com/pricing/)
- [Functions 설정](https://docs.netlify.com/build/functions/configuration/)
