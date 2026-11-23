# cover-fx.js — 책 표지 변형 효과 엔진

이미지 한 장을 화려하게 변형했다가 단계마다 애니메이션으로 원래 모습으로 되돌리는 효과 모듈입니다.
의존성과 빌드가 없고 `file://`에서도 동작합니다(`getImageData`를 쓰지 않음).

## 들어 있는 파일
- `cover-fx.js`: 모듈 (이 파일 하나만 있으면 됩니다)
- `embed-example.html`: 브라우저로 열면 모든 효과를 시험할 수 있습니다. 내 이미지를 넣어보거나 제목 영역을 드래그로 지정할 수 있습니다.

## 가장 짧은 사용법
```html
<div id="box" style="height:600px"></div>
<script src="cover-fx.js"></script>
<script>
  const fx = CoverFX.create('#box', { src: 'cover.jpg', effect: 'shuffle' });
  document.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') fx.next(); });
</script>
```
- 표지는 `div` 안에서 비율을 유지한 채 가운데에 맞춰지고, 창 크기가 바뀌면 다시 맞춰집니다(고해상도 화면 대응).
- `div`에 높이가 없으면 이미지 비율대로 높이를 자동으로 잡습니다.

## API
```js
const fx = CoverFX.create(container, {
  src,            // 이미지 경로 · URL · File/Blob · <img> · <canvas>
  effect,         // 효과 이름 (아래 표)
  opts,           // 효과별 옵션 (선택)
  regions,        // 제목 영역 [{x,y,w,h}] (0~1 비율 좌표, 선택)
  protect: true,  // 힌트 단계 동안 regions 안의 글자를 모자이크로 숨김
  text: '',       // 정답 문구 (초성 힌트 효과가 사용)
  duration: 1000, // 단계 전환 시간(ms)
  padding: 0.03,  // 가장자리 여백 비율
  onChange(info) {}, // {stage, stages, revealed, effect}
  onSettle(info) {}, // 전환 애니메이션이 끝났을 때
});

fx.next(); fx.prev(); fx.reveal(); fx.reset(); fx.goTo(n);
fx.goTo(n, { instant: true });          // 애니메이션 없이 이동
fx.setEffect(name, opts); fx.setImage(src);   // setImage 는 Promise 반환
fx.setRegions([...]); fx.setOptions({ protect: false });
fx.stage; fx.stages; fx.revealed; fx.label; fx.desc;
fx.stageLabel; fx.stageDesc;  // 지금 단계의 효과 이름 (단계별 조합이면 그 단계 효과)
fx.coverRect();   // 컨테이너 안에서 표지가 그려진 위치 (CSS px)
fx.destroy();

CoverFX.effects();    // [{name, label, desc, stages, fit}]  fit: 어울리는 힌트 단계
CoverFX.recommend(k, n);   // n단계 중 k번째(0부터) 단계에 추천하는 효과 이름들
CoverFX.positionOf(k, n);  // 'early' | 'mid' | 'late'
CoverFX.placeholder({ title, sub });  // 임시 표지 canvas 생성
```
- 단계는 `0 ~ stages-1`이 힌트이고, `stages`가 공개(원본)입니다. 공개 상태에서는 원본 이미지를 그대로 그립니다.
- 상태가 바뀌면 컨테이너에서 `coverfx:change` 이벤트도 발생합니다.

## 효과
"추천 단계"는 그 효과가 잘 어울리는 힌트 위치입니다. 첫 단계는 가장 어렵게, 마지막 단계는 서점에서 본 적 있으면 알아볼 정도로 쉽게 잡습니다.

| 이름 | 표시 이름 | 단계 | 추천 단계 | 내용 | 주요 옵션 |
|---|---|---|---|---|---|
| `titlemask` | 제목 가리기 | 2 | 마지막 | 가림막 → 제목 모자이크 → 공개 (`regions` 필요) | `block` |
| `shuffle` | 조각 재배치 | 3 | 첫 · 중간 | 섞임·회전·반전 → 회전 풀림 → 절반 제자리 → 공개. `layout:'frame'`이면 무작위 대신 구조적 배치(180° 회전, X자 반전 → 가운데부터 바로 서기 → 테두리부터 제자리 → 나선으로 완성) | `grid:5`, `invert:0.3`, `layout`, `pos0`, `finish`(마지막 직전에 '다 맞춘 그림' 단계 추가) |
| `invert` | 색상 반전 | 2 | 첫 | 제목 쪽 절반 가림 + 색·좌우 반전 + 무지개 → 카드 뒤집기 → 가림막 치우며 공개 | `cover:'auto'\|'top'\|'bottom'` |
| `strips` | 흔들리는 띠 | 2 | 중간 | 띠 섞임+잔잔한 일렁임 → 제자리 → 공개 | `count:12`, `amp` |
| `mosaic` | 모자이크 | 3 | 중간 · 마지막 | 블록이 점점 작아짐 | `blocks:[10,20,40]` |
| `spotlight` | 손전등 | 3 | 첫 · 중간 | 어둠 속 움직이는 빛이 점점 커짐. `path:'eight'`이면 8자 고정 경로 | `radius`, `count`, `area:{x,y,w,h}`, `path`, `paths`(힌트별 범위) |
| `zoom` | 초근접 줌 | 3 | 첫 | 아주 가까이에서 점점 멀어짐 | `zoom:[6,3,1.7]`, `focus:{x,y}` |
| `tiles` | 타일 뒤집기 | 3 | 중간 | 번호판이 뒤집히며 드러남, 제목 칸과 `key` 지점 근처는 마지막. `random:false`면 무작위 없이 고정 순서 | `cols:5`, `open`, `key:[{x,y,r}]`, `random`, `style:'door'`(어드벤트 캘린더 문), `colors` |
| `scratch` | 복권 긁기 | 3 | 첫 · 중간 | 은박을 동전으로 긁어낸 자리가 보임 | `strokes:[3,4,5]`, `width` |
| `blinds` | 블라인드 | 3 | 중간 · 마지막 | 블라인드 틈새가 점점 넓어짐 | `count:10`, `open` |
| `fog` | 뿌연 안개 | 3 | 마지막 | 흐리고 색 바랜 표지가 점점 선명해짐 | `blur`, `sat`, `haze` |
| `palette` | 색감 팔레트 | 2 | 첫 | 표지 색만 물감 칩으로 보여줌 | `grids:[[3,4],[5,7]]` |
| `silhouette` | 흑백 실루엣 | 2 | 중간 | 색을 지우고 형태만 | `contrast:[8,2.2]` |
| `chosung` | 초성 힌트 | 2 | 마지막 | 정답 초성 카드 → 첫 글자 공개 (`text` 필요) | `text` |
| `door` | 삐걱 문틈 | 3 | 첫 · 중간 | 어두운 나무 문이 조금씩 열리며 틈으로 엿보기 | `open:[0.08,0.22,0.42]`, `at` |
| `steam` | 김 서린 유리 | 3 | 중간 · 마지막 | 김 서린 유리를 손으로 닦은 자리만 선명. `paths`로 닦는 자리를 단계별로 지정 | `wipes:[2,3,4]`, `paths`, `blur`, `frost` |
| `bubbles` | 물방울 | 3 | 중간 | 깊은 물속, 떠오르는 물방울 안만 또렷 | `count:[8,12,16]`, `radius`, `speed` |
| `mix` | 단계별 조합 | 단계 수만큼 | - | 힌트마다 다른 효과, 책장 넘기듯 전환 | `steps:['zoom','tiles','chosung']` |

```js
// 단계별 조합: 첫 힌트는 초근접 줌, 다음은 타일, 마지막은 초성
fx.setOptions({ text: '지구 끝의 온실' });
fx.setEffect('mix', { steps: ['zoom', 'tiles', 'chosung'] });
// 단계마다 옵션도 줄 수 있음 (예: 줌 시작 위치)
fx.setEffect('mix', { steps: ['zoom', 'tiles', 'chosung'], stepOpts: [{ focus: { x: 0.6, y: 0.47 } }, {}, {}] });
```

## 효과 추가하기
```js
CoverFX.register('myfx', {
  label: '내 효과', desc: '설명', stages: 2,
  animated: (t) => t < 2,            // 시간에 따라 계속 움직이면 지정
  init({ opts, rand }) { return {}; },  // 상태 준비 (rand 는 시드 고정 난수)
  render(ctx, s) {
    // s.t: 0~stages 연속값(이징 적용). s.src: 표지(canvas). s.w, s.h: 표지 크기
    // ctx 원점은 표지 왼쪽 위. s.H 에 pixelate / invert / rainbow 등 도우미가 있음
    ctx.globalAlpha = s.t / s.stages;
    ctx.drawImage(s.src, 0, 0);
  },
});
```

## 참고
- 다른 사이트의 이미지를 써도 그리기는 되지만(캔버스를 읽지 않으므로), 해당 서버가 이미지 링크를 막으면 불러오지 못합니다. 이미지를 함께 두는 것이 안전합니다.
- 크롬 계열(크롬·엣지·웨일) 기준으로 만들었고 크로미움에서 시험했습니다. 사파리는 최신 버전을 권장합니다.
