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
fx.coverRect();   // 컨테이너 안에서 표지가 그려진 위치 (CSS px)
fx.destroy();

CoverFX.effects();    // [{name, label, desc, stages}]
CoverFX.placeholder({ title, sub });  // 임시 표지 canvas 생성
```
- 단계는 `0 ~ stages-1`이 힌트이고, `stages`가 공개(원본)입니다. 공개 상태에서는 원본 이미지를 그대로 그립니다.
- 상태가 바뀌면 컨테이너에서 `coverfx:change` 이벤트도 발생합니다.

## 효과
| 이름 | 표시 이름 | 단계 | 내용 | 주요 옵션 |
|---|---|---|---|---|
| `titlemask` | 제목 가리기 | 2 | 가림막 → 제목 모자이크 → 공개 (`regions` 필요) | `block` |
| `shuffle` | 조각 재배치 | 3 | 섞임·회전·반전 → 회전 풀림 → 절반 제자리 → 공개 | `grid:5`, `invert:0.3` |
| `invert` | 색상 반전 | 2 | 반전+좌우반전+무지개 → 카드 뒤집기 → 원형으로 색 복원 | `rainbow`, `mosaic` |
| `strips` | 흔들리는 띠 | 2 | 띠 섞임+잔잔한 일렁임 → 제자리 → 공개 | `count:12`, `amp` |
| `mosaic` | 모자이크 | 3 | 블록이 점점 작아짐 | `blocks:[10,20,40]` |
| `spotlight` | 손전등 | 3 | 어둠 속 움직이는 빛이 점점 커짐 | `radius`, `count` |
| `zoom` | 초근접 줌 | 3 | 아주 가까이에서 점점 멀어짐 | `zoom:[6,3,1.7]`, `focus:{x,y}` |
| `tiles` | 타일 뒤집기 | 3 | 번호판이 뒤집히며 드러남, 제목 칸은 마지막 | `cols:5`, `open:[0.22,0.42,0.65]` |
| `scratch` | 복권 긁기 | 3 | 은박을 동전으로 긁어낸 자리가 보임 | `strokes:[3,4,5]`, `width` |
| `blinds` | 블라인드 | 3 | 블라인드 틈새가 점점 넓어짐 | `count:10`, `open` |
| `fog` | 뿌연 안개 | 3 | 흐리고 색 빠진 표지가 점점 선명해짐 | `blur`, `sat`, `haze` |

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
