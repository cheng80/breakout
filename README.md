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

별도 서버 런타임이나 환경 변수는 필요하지 않습니다. 빌드가 끝난 뒤 `dist/` 안의 파일을 정적 호스팅 서비스에 배포하면 됩니다.

`/breakout/` 하위 경로로 빌드했다면 `dist` 디렉터리 자체가 아니라 그 안의 파일을 서버의 `breakout` 디렉터리에 올립니다.

```text
웹 루트/
└── breakout/
    ├── index.html
    └── assets/
```

배포 후 `https://example.com/breakout/`으로 접속합니다. `src/`, `node_modules/`, `package.json`, `.DS_Store`는 서버에 올리지 않습니다.

## 문제 해결

- `vite`, `vitest`, `tsc`를 찾지 못하면 `npm ci`를 다시 실행합니다.
- Node.js 버전 오류가 나오면 요구사항에 맞는 버전으로 변경한 뒤 `npm ci`를 다시 실행합니다.
- 기본 포트가 사용 중이면 개발 서버나 미리보기 명령이 출력한 대체 주소를 사용합니다.
