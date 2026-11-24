# 인수인계: 굴러가는 만다라트 (Notion MCP 빌드)

이어받는 에이전트를 위한 메모예요. 지금 노션에 어디까지 만들어졌고 무엇이 남았는지, 그리고 작업하다 확인한 API 제약을 정리했어요.

- 노션 루트: https://app.notion.com/p/42156dd3dc588193880ec848041180e2 (예지님의 워크스페이스, 무료 플랜)
- 모든 페이지·DB·데이터 소스 ID: `out/ids.json` (`pages.<key>`, `dbs.<name>.ds`)
- 도구는 `notion-mandalart/` 디렉터리에서 실행해요 (`out/ids.json`과 `pages/manifest.json`을 상대 경로로 읽음).

## 1. 끝난 것

| 항목 | 상태 |
|---|---|
| 페이지 27개 (루트·메인 12·가이드 13·DB 페이지) + 아이콘·커버 | ✅ |
| DB 9개, 관계형, 수식·롤업 전부 | ✅ |
| 라이브러리 592행 (프리셋 12 · 세부 후보 96 · 실천 후보 484) | ✅ |
| 샘플 만다라트 2개 + 세부 9 · 실천 64 · 기간 8 · 할 일 16 · 회고 9 · 해부 3 · 실행 기록 350 | ✅ |
| 뷰 64개 (`pages/manifest.json` 기준) | ✅ (아래 3번의 제약은 수동 마감 필요) |
| 본문: 루트, 홈, 보드, 모바일, 기간 계획, 할 일, 습관, 회고, 비교, 작년 해부, 재시작, 라이브러리, 시작 가이드, 데이터베이스 | ✅ |
| DB마다 숨김 수식 칸 `필터용` 추가 (만다라트·세부목표·실천항목·할 일·실행 기록) | ✅ (이유는 3번) |

## 2. 남은 일

### 2-1. 가이드 하위 페이지 13개 본문 (지금은 빈 페이지)
- 본문은 이미 변환해 둠: `handoff/guide_md/<key>.md` (Notion-flavored Markdown, 멘션 URL 포함)
- 다시 만들려면: `python3 handoff/build.py <key> > out.md`
- 넣는 방법: `notion-update-page` · `command: insert_content` · `content` = 파일 내용 · `allow_async: false`
- 대상 (key → page id는 `out/ids.json` → `pages`):
  `g_lastyear, g0, g1, g2, g3, g4, g5, g6, g7, g8, g_restart, g_ai, g_faq`

### 2-2. DB 템플릿 (`templates/*.md`)
- API로는 DB 템플릿을 만들 수 없어서 아직 손대지 않았어요. `MANUAL_CHECKLIST.md`에 "노션에서 직접 새 템플릿 → 본문 붙여넣기" 항목으로 넣어 주세요.

### 2-3. `MANUAL_CHECKLIST.md` 갱신 (사람이 노션 UI에서 할 일)
- 버튼 25개: `pages/manifest.json` → `buttons` (페이지 본문에는 회색 "버튼 자리" 콜아웃으로 표시해 둠). 버튼 속성(`✅ 오늘 했음` 등)도 API로 못 만들어서 뷰 SHOW 목록에서 뺐어요. 만든 뒤 홈 🔥 오늘의 행동, 습관 히트맵, 모바일 오늘 체크, 재시작 🚨 뷰에 보이게 켜야 해요.
- 뷰 그룹 수동 설정: `handoff/manual_notes.md`를 그대로 옮기면 돼요.
- 원인 유형별 보드(작년 해부): 그룹을 분야 → **주원인**으로 바꾸기
- 수식 % 표시, 수식 값 눈으로 확인 (MCP는 수식 결과를 `formulaResult://` 참조로만 돌려줘서 검증할 수 없었음)
- 라이브러리 실천 후보 중 빠진 284개는 `out/library.csv`에서 CSV로 병합 (세부목표 26~96은 4개씩만 넣었음: 0·1·2번과 마지막 마음가짐)

### 2-4. 저장소 정리
- `tools/schema_api.py`가 실제 노션 수식과 맞는지 확인하고 `필터용` 5개를 추가하기. 정의는 아래 3번에 있어요.
- `README.md` 상태표 갱신
- 브랜치 `ccr-1a2dde95-im06of`에 커밋

## 3. 작업하면서 확인한 API 제약

1. **수식 필터는 텍스트 연산만 돼요.** 체크박스·숫자 결과 수식에 `= TRUE`, `<= 4`를 걸면 오류 없이 필터가 빠지거나 400 오류가 나요. 그래서 텍스트 수식 `필터용`을 만들고 `"필터용" CONTAINS "현재"`처럼 걸었어요.
   - 만다라트·세부목표: `if(prop("현재"), "현재", "")`
   - 실천항목: `if(prop("현재"), "현재 ", "") + if(prop("활성"), "활성 ", "") + if(prop("오늘 순서") <= 4, "오늘", "")`
   - 할 일: 이번 주(월~일)이면 `"이번 주"`
   - 실행 기록: `if(prop("이번주") == 1, "이번주", "")`
2. **수식·롤업으로는 그룹을 못 만들어요.** 테이블·리스트에서는 그룹이 오류 없이 빠지고, 보드에서는 그룹 없는 보드가 되고, 롤업이면 400 오류가 나요. 지금은 정렬로 대신하거나 셀렉트·체크박스로 임시 그룹을 걸어 뒀어요.
3. **타임라인 끝 날짜는 date 속성이어야 해요.** `기간 끝`은 수식이라 시작일만 지정했어요.
4. **`create-view`의 `parent_page_id`는 항상 페이지 맨 끝에 붙여요.** 그래서 뷰를 먼저 다 만들고, `fetch`로 `<database url=…>` 블록 URL을 얻은 다음, `handoff/build.py <page> <url…>`로 본문을 만들어 `replace_content`로 한 번에 넣었어요.
5. **`replace_content`로 `<columns>` 안의 뷰를 옮기면 순서가 섞일 수 있어요.** 같은 내용으로 한 번 더 replace 하면 바로잡혀요. 넣은 뒤엔 꼭 fetch로 순서를 확인하세요.
6. 한 메시지에 여러 Notion 호출을 보내면 순서대로 실행돼요(확인함).
7. `<details>`는 안 되고 `<toggle>`을 써야 해요. 변환은 `handoff/nmd.py`가 해요.

## 4. 파일 안내

| 파일 | 용도 |
|---|---|
| `handoff/nmd.py` | repo md → Notion md 변환 (`convert`, `segments`) |
| `handoff/build.py` | 페이지 본문 생성, `[[VIEW:k]]` → 주어진 블록 URL 순서대로 `<database>` 태그 |
| `handoff/ops.py` / `ops.json` | manifest 뷰 → `create-view` 인자 (DSL 변환 규칙 포함) |
| `handoff/guide_md/` | 가이드 13개 본문 (바로 넣으면 됨) |
| `handoff/manual_notes.md` | 뷰 수동 마감 목록 |
| `handoff/*_urls.json` | 라이브러리·샘플 key → page id |
