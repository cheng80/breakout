# Swipe Breakout

TypeScript, Vite, PixiJS로 만든 터치·마우스 기반 벽돌깨기 웹게임입니다.

## 요구사항

- Node.js `^20.19.0` 또는 `>=22.12.0`
- npm

현재 사용 중인 버전은 다음 명령으로 확인합니다.

```bash
node --version
npm --version
```

## 설치

저장소를 받은 뒤 루트 디렉터리에서 잠금 파일 기준으로 의존성을 설치합니다.

```bash
npm ci
```

## 개발 서버 실행

```bash
npm run dev
```

기본 주소는 [http://localhost:5173](http://localhost:5173)입니다. 해당 포트가 사용 중이면 터미널에 표시되는 주소로 접속합니다.

## 테스트

```bash
npm test -- --run
```

Vitest로 핵심 게임 규칙 테스트를 한 번 실행하고 종료합니다.

## 프로덕션 빌드

도메인 루트(`/`)에 배포할 때는 다음 명령을 사용합니다.

```bash
npm run build
```

빌드는 다음 순서로 실행됩니다.

1. `tsc --noEmit`: strict TypeScript 타입 검사
2. `vite build`: 정적 프로덕션 파일 생성

완성된 파일은 루트의 `dist/` 디렉터리에 생성됩니다.

## 오디오 생성

게임 실행에는 API 키가 필요하지 않습니다. 오디오를 다시 생성할 때만 `.env.example`을 복사해 `.env`에 ElevenLabs 키를 설정합니다.

```bash
npm run audio:plan
npm run audio:generate
```

`audio:plan`은 API를 호출하지 않고 생성 대상과 예상 크레딧만 표시합니다. `audio:generate`는 기존 파일을 건너뛰고 누락된 파일만 순차 생성합니다.

특정 파일을 다시 만들 때는 `node scripts/generate-audio.mjs --generate --force --only=launch`처럼 대상과 `--force`를 함께 지정합니다.

BGM 재생성은 Eleven Music API를 사용하므로 ElevenLabs 유료 플랜이 필요합니다. 무료 플랜에서는 효과음 생성만 가능하며, 기존 BGM 파일 재생에는 API 키가 필요하지 않습니다.

### `/breakout/` 하위 경로 빌드

`https://example.com/breakout/`처럼 하위 경로에 배포할 때는 Vite의 base 경로를 지정해 빌드합니다.

```bash
npm run build -- --base=/breakout/
```

앞뒤 슬래시를 포함한 `/breakout/`을 사용해야 합니다. 이 빌드의 JavaScript와 CSS 주소는 `/breakout/assets/`를 기준으로 생성됩니다.

## 빌드 결과 확인

```bash
npx vite preview --host 0.0.0.0
```

기본 주소는 [http://localhost:4173](http://localhost:4173)입니다. 이 명령은 개발 서버가 아니라 `dist/` 결과물을 로컬에서 확인할 때 사용합니다.

## 배포

게임만 배포할 때는 별도 서버 런타임이나 환경 변수가 필요하지 않습니다. 빌드가 끝난 뒤 `dist/` 안의 파일을 정적 호스팅 서비스에 배포하면 됩니다. 랭킹을 사용할 때는 아래 PHP API를 NAS에 추가로 배포합니다.

`/breakout/` 하위 경로로 빌드했다면 `dist` 디렉터리 자체가 아니라 그 안의 파일을 서버의 `breakout` 디렉터리에 올립니다.

```text
웹 루트/
└── breakout/
    ├── index.html
    ├── assets/
    └── audio/
```

배포 후 `https://example.com/breakout/`으로 접속합니다. `src/`, `node_modules/`, `package.json`, `.DS_Store`는 서버에 올리지 않습니다.

### 랭킹 API 배포

랭킹 서버 파일은 [server/breakoutranking/ranking.php](server/breakoutranking/ranking.php)입니다. NAS의 다음 경로에 `ranking.php`로 업로드합니다.

```text
/Web/breakoutranking/ranking.php
```

랭킹 데이터는 PHP의 `__DIR__` 기준으로 같은 경로에 자동 생성됩니다.

```text
/Web/breakoutranking/ranking_data.json
```

게임은 `/breakout/`에서 `../breakoutranking/ranking.php` 상대경로로 API를 호출합니다. 다른 호스트나 경로를 사용할 때만 `.env`에 `VITE_RANKING_URL`을 지정한 뒤 다시 빌드합니다.

랭킹은 점수 내림차순, 스테이지 내림차순으로 정렬하고, 점수와 스테이지가 같으면 1스테이지부터 게임오버까지의 순수 플레이 시간이 짧은 기록을 우선합니다. 발사 조준·공 비행만 누적하며 일시정지와 발사 대기 시간은 제외합니다.

## 문제 해결

- `vite`, `vitest`, `tsc`를 찾지 못하면 `npm ci`를 다시 실행합니다.
- Node.js 버전 오류가 나오면 요구사항에 맞는 버전으로 변경한 뒤 `npm ci`를 다시 실행합니다.
- 기본 포트가 사용 중이면 개발 서버나 미리보기 명령이 출력한 대체 주소를 사용합니다.
