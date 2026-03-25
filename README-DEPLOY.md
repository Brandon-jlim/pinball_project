# 배포 가이드

## 1) 같은 네트워크에서 바로 공유
```bash
yarn dev:lan
```
그 다음 같은 와이파이에 있는 사람에게 `http://내PC의사설IP:1235` 를 공유합니다.

## 2) GitHub Pages 배포
1. GitHub에 저장소를 푸시합니다.
2. 저장소 Settings > Pages > Source 를 `GitHub Actions` 로 설정합니다.
3. `main` 브랜치에 푸시하면 자동 배포됩니다.
4. 저장소가 `username.github.io` 가 아니면 주소는 `https://username.github.io/저장소이름/` 입니다.

## 3) Docker로 서버 배포
```bash
docker build -t roulette .
docker run -d --name roulette -p 8080:80 roulette
```
브라우저에서 `http://서버IP:8080` 으로 접속합니다.

루트 경로가 아닌 하위 경로에 배포해야 하면 build 시 `PUBLIC_URL` 을 지정하세요.
예:
```bash
PUBLIC_URL=/roulette/ yarn build
```
