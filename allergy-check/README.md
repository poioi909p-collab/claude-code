# 알레르기 체크 웹앱

식품 성분표를 MAST 검사 결과와 대조해서 "먹어도 되나?"를 신호등으로 보여주는 가족용 웹앱입니다. 전체 명세는 [SPEC.md](./SPEC.md)에 있습니다.

## 진행 상황

- [x] **1단계** — 프로필 시드 데이터, 동의어 사전, 매칭 로직, 단위 테스트
- [x] **2단계** — 텍스트 직접 입력 → 결과 화면 (Next.js)
- [x] **3단계** — 카메라 촬영 + 이미지 분석 API (실제 키로 확인은 남음)
- [ ] 4단계 — 프로필 관리, 부모 PIN, 가족 상태 설정
- [ ] 5단계 — 기록, PWA, 응급 버튼, 내보내기·가져오기
- [ ] 6단계 — 실제 성분표 20장 이상으로 인식률 점검

## 실행

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # 단위 테스트
npm run typecheck
npm run build
```

## 사진 분석 설정 (3단계)

1. `.env.example`을 `.env.local`로 복사합니다.
2. `ANTHROPIC_API_KEY`에 console.anthropic.com에서 만든 키를 넣습니다.
3. 배포할 때는 `FAMILY_ACCESS_CODE`도 정합니다. 처음 사진을 찍을 때 한 번 물어보고 그 기기에 저장합니다.
4. Vercel에서는 프로젝트 Settings → Environment Variables에 같은 이름으로 넣습니다.

키가 없으면 사진 분석 대신 "글자로 입력해 주세요" 안내가 나오고, 글자 입력은 그대로 쓸 수 있습니다.

사진 처리 흐름: 폰에서 긴 변 1600px JPEG로 줄임 → `/api/analyze`(서버)가 사진만 Claude에 보내 글자를 받음 → 폰에서 코드 규칙으로 판단.
프로필은 서버로 가지 않고, 사진은 서버에 저장하지 않습니다.

## 구조

```
data/
  profile.seed.json   2026-09-11 MAST 결과 (첫 실행 때 부모가 확인·수정)
  synonyms.json       성분 동의어 사전 + 의무표시 22종 + '알레르기 아님' 단어
src/app/
  page.tsx            홈
  api/analyze/        사진 → 성분표 글자 (서버, API 키는 여기서만)
src/components/
  HomeScreen.tsx      촬영·불러오기·글자 입력 → 분석 중 → 결과/오류
  TextInputForm.tsx   성분표 글자 입력 + 예시
  ResultView.tsx      신호등 카드, 걸린 성분 목록, 원본 사진, 원문 하이라이트
src/lib/server/
  extractLabel.ts     Claude 호출 (구조화 출력, 글자만 옮기라는 지시문)
src/lib/client/
  resizeImage.ts      업로드 전 축소 (1600px, JPEG 0.8)
  analyzeApi.ts       /api/analyze 호출, 가족 코드, 오류 문구
src/lib/allergy/
  types.ts            데이터 모양 (LabelExtraction = 이미지 분석 API 응답 형식)
  levels.ts           Class → 등급, 가족 설정 우선, 같은 제조시설 하향
  lexicon.ts          동의어 사전 → 성분표 단어 찾기 (하이라이트 위치 포함)
  parseLabel.ts       텍스트로 붙여넣은 성분표 → LabelExtraction
  analyze.ts          매칭 결과 + 프로필 → 최종 결과 (위험 판단은 전부 여기서, 코드로)
  messages.ts         결과 카드·성분 줄 문구 (중학생 눈높이)
  highlight.ts        원문에서 걸린 단어 하이라이트 조각
  labelSchema.ts      이미지 분석 응답 형식 (zod)
tests/                SPEC 예시 + 경계 사례
```

사용 예:

```ts
import { analyzeText, resultCard, hitLine } from "@/lib/allergy";

const result = analyzeText("양념분말(대두, 밀, 새우), 효모추출물");
resultCard(result);          // { icon: "⛔", title: "먹지 마세요", subtitle: "효모가 들어 있어요", ... }
result.hits.map(hitLine);    // ["효모추출물 → 효모", "새우 → 새우", ...]
```

## 매칭 규칙 (1단계에서 정한 것)

- **포함 매칭**: 사전 단어가 성분명 안에 들어 있으면 걸림 (`새우` → `새우추출물`, `유청` → `유청분말`).
- **긴 단어 우선**: 더 긴 단어가 짧은 단어를 완전히 감싸면 긴 단어만 인정.
  `땅콩`은 콩(대두)으로, `메밀가루`는 밀로, `코코아버터`는 우유로, `오이스터소스`는 오이로 걸리지 않습니다.
- **알레르기 아님 단어**(`notAllergens`): `파인애플`(사과 아님), `아밀라아제`(밀 아님), `완두콩`(대두 아님) 등.
- **띄어쓰기**: 공백을 지운 경우와 공백을 경계로 둔 경우를 둘 다 찾아서 합칩니다. 한쪽에서만 걸려도 남기므로, 애매하면 경고가 늘어나는 쪽으로 갑니다.
- **묶음 단어**: `갑각류`, `조개류`(굴·전복·홍합 포함), `견과류`, `해산물` 등은 여러 항목에 동시에 걸립니다.
- **같은 제조시설 하향**: 위험 → 주의 → 참고. 참고는 더 내리지 않고 목록에 남깁니다. 원재료나 함유 표시에 한 번이라도 나오면 하향하지 않습니다.
- **가족 "먹어도 괜찮음"**: 참고까지만 내립니다. 원래 표시하지 않던 항목(Class 0~1)을 새로 띄우지는 않습니다.
- **회색(확인 불가)**: 신뢰도 low면 항상 회색입니다. 신뢰도 medium이거나 못 읽은 부분이 있을 때 찾은 성분이 없으면 초록 대신 회색으로 보여줍니다.
- SPEC 예시 사전의 `라이`(호밀)는 넣지 않았습니다. `라이스`·`프라이`·`라이신`처럼 잘못 걸리는 단어가 너무 많아서입니다. `호밀`, `rye`로 찾습니다.
