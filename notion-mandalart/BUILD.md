# BUILD — Notion MCP로 템플릿 생성하기 (A안 런북)

> **누가 읽나**: Notion 커넥터가 연결된 **새 Claude Code 세션**.
> 사용자는 이렇게 말하면 된다: *"브랜치 `ccr-1a2dde95-im06of` 의 `notion-mandalart/BUILD.md` 대로 노션에 만들어 줘"*.
> 이 문서의 단계를 순서대로 수행하고, 단계마다 무엇을 만들었는지 짧게 보고한다.

## 0. 준비
1. `git fetch origin ccr-1a2dde95-im06of && git checkout ccr-1a2dde95-im06of`
2. `cd notion-mandalart && python3 tools/build_assets.py` → **에러 0** 확인. 기준일은 오늘(샘플 날짜가 오늘 기준으로 다시 계산됨).
3. Notion MCP 도구 목록을 확인하고, 각 도구가 받는 형식(특히 Notion-flavored Markdown, 속성 값 형식, DB 생성 DDL)을 MCP가 제공하는 스펙 리소스로 확인한다. **뷰 생성 도구**와 **버튼** 지원 여부를 여기서 판단해 `out/build_log.md` 첫 줄에 적는다.
4. 부모 페이지: 사용자가 고른 방식은 "검색으로 자동 선택" → `notion-search` 로 Integration/커넥터가 접근 가능한 페이지를 찾고, **후보 목록을 사용자에게 보여 준 뒤** 하나를 확정한다(엉뚱한 페이지 아래에 만들지 않도록). 확정 후 진행.
5. 생성한 모든 객체의 ID/URL은 `out/ids.json` 에 즉시 기록한다(`{"pages":{key:url}, "dbs":{key:{"db":id,"ds":data_source_id}}, "rows":{sample_key:url}}`). 중간에 실패해도 이어서 할 수 있게.

## 1. 페이지 골격
`pages/manifest.json` 의 `pages` 순서대로 생성(본문은 아직 비움). 아이콘·커버(`design.cover_base + cover`) 적용. `full_width` 목록은 전체 너비(지원 안 되면 체크리스트로).

## 2. 데이터베이스 9개 (속성만)
`out/schema.json` 기준. 부모 = `db` 페이지(🗄️ 데이터베이스), **인라인**.
1. 각 DB를 제목 속성 + select/multi_select/status/number/date/checkbox/rich_text/files 속성으로 생성. select 옵션의 색 그대로.
   - status 옵션 지정이 안 되면 기본 status 로 만들고 옵션 이름 변경을 체크리스트에 기록.
2. **관계형**: `type: relation` 을 **양방향(dual)** 으로 추가. 반대편 이름은 `dual`. 같은 쌍을 두 번 만들지 않도록 한쪽에서만 생성.
   - 자기 참조: 만다라트.이전 만다라트↔다음 만다라트, 기간 목표.상위 기간 목표↔하위 기간 목표, 추천 라이브러리.상위 항목↔하위 항목.
   - 같은 두 DB 사이 관계가 2개인 곳: 지난 목표 분석 ↔ 만다라트 (분석 대상/실패 분석, 반영할 만다라트/작년의 교훈).
3. **수식**: `_formula_order` 순서대로 하나씩 추가. 한 번에 넣다 실패하면 그 수식 이름과 에러를 기록하고 다음으로.
   - 수식이 문법 에러로 거부되면: 함수 이름/인자 순서를 Notion Formula 2.0 문서와 대조해 고치고, 고친 내용을 `tools/schema.py` 에도 반영(원본 일치).
4. `button` 타입 속성은 만들 수 있으면 만들고(액션은 체크리스트), 불가하면 체크리스트로.

## 3. 수식 검증 (샘플 넣기 전)
각 DB에 임시 행 1개씩 넣고 `notion-fetch` 로 수식 값을 읽어 **에러 표시가 없는지** 확인 → 임시 행 삭제. 결과를 `out/build_log.md` 에 표로.

## 4. 시드 데이터
순서가 중요(관계형은 대상이 먼저 있어야 함). `out/sample_mandalart.json`, `out/library.json` 사용. `_` 로 시작하는 키는 메모이므로 넣지 않는다. 키(`key`) → 생성된 페이지 URL을 `ids.json.rows` 에 기록하며 관계형 값을 URL로 치환.
1. **추천 라이브러리 876행**: 프리셋(P01~) → 세부목표 후보(G001~, 상위 항목 = 프리셋들) → 실천항목 후보(A0001~, 상위 항목 = G…). 한 번에 가능한 최대 개수로 배치. `짧은 이름`, `key` 열은 속성이 아니므로 넣지 않음.
   - 프리셋 행의 본문 = `out/preset_pages/Pxx.md`.
2. **샘플**: 만다라트(M_PREV → M_NOW) → 세부목표(SG_C, SG1~8) → 실천항목 64 → 기간 목표(P_S1 → 하위) → 할 일 → 실행 기록 → 회고(본문 `_body` 는 질문=제목 2, 답=문단으로) → 지난 목표 분석.
   - 기간(date range): `{"start","end"}`.
3. 넣은 뒤 `notion-fetch` 로 확인: 만다라트 "6개월 갓생 만들기"의 전체 달성률·페이스·작년 이맘때 비교, 세부목표 미니 그리드에 🟩🟨⬜💤가 섞여 보이는지, 실천항목 '오늘 할 차례'.

## 5. 뷰
`manifest.views` 의 각 뷰를 해당 페이지의 `[[VIEW:키]]` 자리에 **링크된 데이터베이스 뷰**로 만든다. `same_as` 는 그 정의를 복사해 덮어쓴다.
- MCP에 뷰 생성 도구가 있으면: layout·filter·sort·group·표시 속성·카드 크기·미리보기 없음·속성 줄바꿈까지 설정.
- 없으면: `[[VIEW:키]]` 자리에 회색 콜아웃 `🔧 여기에 뷰: <이름>` 을 두고 MANUAL_CHECKLIST.md 의 '뷰' 표로 넘긴다. (원본 DB 블록을 링크 대신 복제하지 말 것.)
- 원본 DB 9개는 `13_db.md` 의 `[[DATABASES]]` 자리에 인라인으로.

## 6. 페이지 본문
`pages/*.md`, `pages/guide/*.md` 를 Notion-flavored Markdown 으로 넣는다. 치환:
- `{{page:키}}` → `<mention-page url="..."/>`
- `[[VIEW:…]]` → 5단계 결과, `[[BUTTON:…]]` → 7단계 결과
- 탭 들여쓰기 = 자식 블록(콜아웃/컬럼/토글 안)
- MCP가 모르는 태그가 있으면 가장 가까운 블록으로 바꾸고 기록(예: `<span color>` 미지원 → 일반 텍스트).

## 7. DB 템플릿 · 버튼
- `templates/*.md`: 프런트매터의 db/name/props 로 **DB 템플릿** 생성(가능하면), `default: true` 는 기본 템플릿으로. `[[TVIEW: …]]` 는 템플릿 안 링크된 뷰(자기 페이지 필터) — 대개 수동.
- 버튼: `manifest.buttons`. API/MCP로 안 되면 MANUAL_CHECKLIST.md 에 이미 위치·설정값이 적혀 있으므로, 실제 생성한 페이지 링크만 채워 넣는다.

## 8. 마무리 보고
- 루트 페이지 링크
- `out/build_log.md`: 만든 것 / 실패한 것 / 수식 에러 수 / 수동으로 넘긴 항목
- MANUAL_CHECKLIST.md 에서 실제로 남은 항목만 체크 해제 상태로 남기고 커밋·푸시
