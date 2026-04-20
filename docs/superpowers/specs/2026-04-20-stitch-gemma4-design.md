# Stitch + Gemma 4 HTML Generator

**Date:** 2026-04-20  
**Status:** Approved

## Overview

`npm run stitch` 실행 시 사용자가 CLI에서 design system과 프롬프트를 입력하면, Gemma 4가 Stitch SDK 도구를 자율 호출해 HTML 웹 페이지를 생성하고 브라우저로 열어주는 스크립트.

## Architecture

```
npm run stitch
     │
     ▼
① CLI: designs/ 폴더 스캔 → design system 선택 (inquirer select)
     │
     ▼
② CLI: 사용자 프롬프트 입력 (inquirer input)
     │
     ▼
③ generateText()
   - model: ollama(process.env.OLLAMA_MODEL)
   - tools: stitchTools()
   - system: 기본 지시 + 선택한 designs/{name}/DESIGN.md 내용
   - prompt: 사용자 입력
     │
     ▼  (Gemma 4 자율 tool call)
④ Stitch: create_project → generate_screen
     │
     ▼
⑤ screen.getHtml() → result/YYYY-MM-DD_HHmmss.html 저장
     │
     ▼
⑥ open 패키지로 브라우저 자동 오픈
```

## File Structure

```
stitch-test/
├── designs/
│   └── {design-name}/
│       └── DESIGN.md
├── result/
│   └── (생성된 .html 파일들)
├── src/
│   └── index.ts
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

## Tech Stack

| 패키지 | 용도 |
|--------|------|
| `@google/stitch-sdk` | Stitch 화면 생성 |
| `ai` | Vercel AI SDK core |
| `ollama-ai-provider` | Ollama 로컬 모델 provider |
| `@inquirer/prompts` | CLI 선택/입력 UI |
| `open` | 브라우저 오픈 |
| `dotenv` | 환경변수 로드 |

## Environment Variables

```
STITCH_API_KEY=...
OLLAMA_MODEL=gemma4:2b   # ollama pull로 받은 모델명
```

Ollama는 기본 `http://localhost:11434` 에서 실행 중이어야 합니다.

## CLI Flow

```
$ npm run stitch

? Select design system:
  ❯ minimal
    material
    glassmorphism
    (none)

? Describe the page: A dashboard with dark theme and charts

⠋ Generating...

✓ Saved: result/2026-04-20_143022.html
✓ Opening in browser...
```

## Design System Selection

- `designs/` 폴더 스캔해 하위 디렉토리 목록 추출
- 각 디렉토리의 `DESIGN.md` 존재 여부 확인 후 목록 표시
- 선택된 `DESIGN.md` 내용을 system prompt에 주입
- `(none)` 선택 시 design context 없이 진행

## Error Handling

| 상황 | 처리 |
|------|------|
| `designs/` 없거나 비어있음 | `(none)` 만 표시, 정상 진행 |
| `DESIGN.md` 읽기 실패 | 경고 출력 후 design 없이 진행 |
| `result/` 없음 | 자동 생성 |
| Gemma 4 tool call 없이 종료 | 에러 메시지 출력 후 종료 |
| `STITCH_API_KEY` 또는 `OLLAMA_MODEL` 누락 | 시작 전 검증, 명확한 에러 메시지 |
| Ollama 서버 미실행 | 연결 에러 감지 후 "Ollama가 실행 중인지 확인하세요" 안내 |

## Out of Scope

- 여러 화면 생성 (단일 HTML만)
- 생성 이력 관리
- Stitch 프로젝트 재사용 (매 실행마다 새 프로젝트 생성)
