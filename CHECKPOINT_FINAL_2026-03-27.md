# Pinball Dev Physics Assist Checkpoint (2026-03-27)

이 체크포인트에는 아래 수정이 통합되어 있습니다.

## 포함된 변경사항
- 참가자별 `weight` 조절 팝업 유지
- `Developer physics assist` UI 추가
- `Target marble` 버튼 목록 선택 방식
- `Assist strength` 슬라이더 / 숫자 입력 / 현재값 동기화
- 참가자 후보 동기화 강화
  - 메인창 참가자 스냅샷
  - 렌더된 weight row 기준으로 dev assist 후보 생성 우선
- 특정 복제 공 선택 지원 (`#1`, `#2`, ...)
- 런타임 전용 물리 보정
  - 하강 보정
  - 튕김 억제
  - 회전 억제
- 마지막 회전문(스피너) 대응 보정
  - 회전문 자동 감지
  - 회전문 근처에서 과도한 중심복귀/반발억제 완화
  - 정체(stall) 감지
  - 회전 방향 기반 측면 탈출 보정 + 하향 복귀 보정

## 실행 방법
사용자 환경 기준:
```bash
npm install
npm run dev
```
또는 기존에 yarn 환경이 있다면:
```bash
yarn install
yarn dev
```

## 팝업 동작
메인 화면의 가중치 버튼은 기본적으로 `weights.html` 팝업을 엽니다.
따라서 `parcel index.html weights.html --port 1235` 흐름과 맞습니다.

## 주의
- 이 ZIP은 **소스 기준 최종 체크포인트**입니다.
- `dist/`는 이전 빌드 산출물이 섞여 있을 수 있으므로, 최신 동작 확인은 `dev` 실행 기준으로 보는 것이 안전합니다.
