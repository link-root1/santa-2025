// main.js
// Santa's Mission - main script
// 仕様に合わせた実装。環境に合わせてパスを確認してくれ。

/* -------------------- グローバル変数 -------------------- */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const uicanvas = document.getElementById("uiCanvas");
const uictx = canvas.getContext("2d");

let TILE = 48;
let cw = 0, ch = 0;

//　場面切り替え
let scene = "game";
// ステージ / マップ
let stage = 1;               // ステージ番号（1..25）
let map = [];                // JSONから来る一次元文字列配列（行ごとの文字列）
let originalLimit = 0;       // JSONのlimitを保持（Aスコア計算用）
let timeLeft = 0;            // 残り時間（秒単位の想定）
let houseLeft = 0;           // 未配達の家件数

// 家に関する管理
let lightTimeArr = [];       // JSONの light-time 配列
let houseLight = [];         // 動的：家ごとの現在「明るい(true)/暗い(false)」
let housePresent = [];       // 配達済みフラグ（trueなら配達済）
let houseLoc = [];           // 家のマップ上の座標リスト（{x,y,idx}）

// サンタ
let santaLoc = [0,0];        // タイル座標 [x,y]
let santaPixel = {x:0,y:0};  // 描画用ピクセル座標（滑らかにしたいときに使う）
let moving = false;          // 現在移動中（入力受け付け制御用）

// スコア
let scoreA = 0;
let timex = 1.0;
let scorex = [false, 10];    // [flag, base]

// テーマ（前半 forest / 後半 snow）
let theme = "forest";

// オフスクリーン（マップ一枚絵）
let mapCanvas = null;
let mapCtx = null;

// 画像オブジェクト群
const IMG = {
  f: null,    // ground
  h: null,    // house
  soil: [],   // road soil 0..15
  gravel: [], // gravel 0..15
  block: null,// unpassable inside (wood/stone)
  out: null,  // unpassable outside (tree/mountain)
  poleL: null, poleR: null, poleLightL: null, poleLightR: null,
  sant: [],   // santa frames
  present: null,
  houseLightImg: null,
  uiTitle: null, uiHow: null, uiResult: null,
  num: []     // 0..9
};

/* 移動にかかる時間（前半/後半） */
const moveTime = {
  house: [1,1],
  soil:  [1,2],
  gravel:[2,3],
  ground:[3,4]
};

/* カメラ */
let camX = 0, camY = 0; // 左上座標（ピクセル）
let viewW = 0, viewH = 0; // 表示領域ピクセル（canvas size）

/* 入力管理 */
const keys = {};

/* -------------------- ユーティリティ -------------------- */
// clamp
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

/* -------------------- ステージ日付判定（午前4時切り替え） -------------------- */
function computeStageFromNow(){
  const now = new Date();
  const day = now.getDate();
  const hour = now.getHours();
  if (hour < 4) stage = day - 1;
  else stage = day;
  if (stage < 1) stage = 1; // 安全策（イベントは月跨ぎしない前提）
}

/* -------------------- 画面サイズ調整 -------------------- */
function stagesize(){
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w / h > 3 / 4) {
    ch = h;
    cw = Math.floor(h * (3 / 4));
  } else {
    cw = Math.floor(w);
    ch = Math.floor(w * (4 / 3));
  }
  canvas.width = cw;
  canvas.height = ch;
  uicanvas.width = cw;
  uicanvas.height = ch;
  viewW = cw; viewH = ch;
  TILE = Math.max(8, Math.round(cw / 6)); // 最低サイズガード
  // サンタをピクセル座標初期化（あとでupdateで調整）
  if (santaLoc) {
    santaPixel.x = santaLoc[0] * TILE;
    santaPixel.y = santaLoc[1] * TILE;
  }
}

/* -------------------- 画像一括ロード（Promise） -------------------- */
function loadImagesForTheme(theme) {
  const promises = [];
  // helper
  const loadImg = (img, src) => {
    return new Promise((res, rej) => {
      img.onload = () => res(img);
      img.onerror = (e) => { console.error("img load error", src); rej(e); };
      img.src = src;
    });
  };

  // ground / house / block / outside
  IMG.f = new Image();
  IMG.h = new Image();
  IMG.block = new Image();
  IMG.out = new Image();
  if (theme === "forest") {
    promises.push(loadImg(IMG.f, "img/tile/ground/normal.png"));
    promises.push(loadImg(IMG.h, "img/tile/house/normal-house.png"));
    promises.push(loadImg(IMG.block, "img/tile/unpassable/inside/wood.png"));
    promises.push(loadImg(IMG.out, "img/tile/unpassable/outside/tree.png"));
  } else {
    promises.push(loadImg(IMG.f, "img/tile/ground/snow.png"));
    promises.push(loadImg(IMG.h, "img/tile/house/snow-house.png"));
    promises.push(loadImg(IMG.block, "img/tile/unpassable/inside/stone.png"));
    promises.push(loadImg(IMG.out, "img/tile/unpassable/outside/mountain.png"));
  }

  // soil (0..15) & gravel (0..15)
  for (let i=0;i<16;i++){
    IMG.soil[i] = new Image();
    IMG.gravel[i] = new Image();
    const soilSrc = (theme==="forest") ? `img/tile/road/soil/${i}.png` : `img/tile/road/snow-soil/${i}.PNG`;
    const gravSrc = (theme==="forest") ? `img/tile/road/gravel/${i}.png` : `img/tile/road/snow-gravel/${i}.PNG`;
    promises.push(loadImg(IMG.soil[i], soilSrc));
    promises.push(loadImg(IMG.gravel[i], gravSrc));
  }

  // poles / lights
  IMG.poleL = new Image(); IMG.poleR = new Image();
  IMG.poleLightL = new Image(); IMG.poleLightR = new Image();
  promises.push(loadImg(IMG.poleL, "img/tile/decoration/LPole.png"));
  promises.push(loadImg(IMG.poleR, "img/tile/decoration/RPole.png"));
  promises.push(loadImg(IMG.poleLightL, "img/tile/decoration/LLight.png"));
  promises.push(loadImg(IMG.poleLightR, "img/tile/decoration/RLight.png"));

  // santa frames (2)
  for (let i=0;i<2;i++){
    IMG.sant[i] = new Image();
    promises.push(loadImg(IMG.sant[i], `img/char/santa${i}.png`));
  }

  // house light image & present icon (optional)
  IMG.houseLightImg = new Image(); promises.push(loadImg(IMG.houseLightImg, "img/tile/house/house-light.png"));
  IMG.present = new Image(); promises.push(loadImg(IMG.present, "img/tile/house/present.png").catch(()=>{}));

  // numbers
  for (let n=0;n<10;n++){
    IMG.num[n] = new Image();
    promises.push(loadImg(IMG.num[n], `img/num/${n}.png`).catch(()=>{}));
  }

  // UI (optional)
  IMG.uiTitle = new Image(); promises.push(loadImg(IMG.uiTitle, "img/page/title.png").catch(()=>{}));
  IMG.uiHow = new Image(); promises.push(loadImg(IMG.uiHow, "img/page/how-to.png").catch(()=>{}));
  IMG.uiResult = new Image(); promises.push(loadImg(IMG.uiResult, "img/page/result.png").catch(()=>{}));

  return Promise.all(promises);
}

/* -------------------- ステージJSON読み込み -------------------- */
async function loadStage(stageNum) {
  try {
    const res = await fetch(`stage/${stageNum}.json`);
    if (!res.ok) throw new Error("ステージJSONが見つからない");
    const data = await res.json();
    // mapは配列（行ごとの文字列）
    map = data.map;
//alert(map);
    originalLimit = data.limit;
//alert(originalLimit);
    timeLeft = data.limit;
//alert(timeLeft);
    houseLeft = data.house;
//alert(houseLeft);
    lightTimeArr = data.light_time || [];
//alert(lightTimeArr);
    santaLoc = data.santa ? data.santa.slice() : [1,1];
//alert(santaLoc);
    timex = data.timex ?? 1.0;
//alert(timex);
    scorex = data.scorex ?? [false, 10];
//alert(scorex);
    // theme判定（仕様上：前半/後半）
    theme = (stageNum < 13) ? "forest" : "snow";
//alert(1);
    // house arrays init
    houseLight = new Array(houseLeft).fill(false);
    housePresent = new Array(houseLeft).fill(false);
    houseLoc = [];
//alert(2);
    // 画像ロード待ち
    await loadImagesForTheme(theme);
//alert(3);
    // マップ一枚絵生成（外枠込み）
    makeMapCanvas();
//alert(4);
    // initial house-light 設定（仕様：light-time < limit なら house-light を設置）
    for (const hinfo of houseLoc){
      const n = hinfo.idx;
      const lt = lightTimeArr[n] ?? Infinity;
      houseLight[n] = (lt < originalLimit) ? true : false;
    }
//alert(5);
    // サンタピクセル位置調整
    santaPixel.x = santaLoc[0] * TILE;
    santaPixel.y = santaLoc[1] * TILE;
//alert(6);
    // hide loader if present
    const loadDiv = document.getElementById("load");
    if (loadDiv) loadDiv.style.display = "none";
//alert(7);
    // start main loop
    requestAnimationFrame(loop);
//alert(8);
    alert(`ステージ${stageNum}を読み込んだぜ`);
  } catch (e) {
    console.error(e);
    alert("ステージ読み込み失敗: " + e.message);
  }
}

/* -------------------- マップ一枚絵生成 -------------------- */
function makeMapCanvas(){
  if (!map || map.length === 0) return;
  const rows = map.length;
  const cols = map[0].length;

  const padL = 3, padR = 3, padT = 4, padB = 4;
  const paddedCols = cols + padL + padR;
  const paddedRows = rows + padT + padB;

  mapCanvas = document.createElement("canvas");
  mapCanvas.width = paddedCols * TILE;
  mapCanvas.height = paddedRows * TILE;
  mapCtx = mapCanvas.getContext("2d");

  // 全体 ground 敷き詰め
  for (let y=0;y<paddedRows;y++){
    for (let x=0;x<paddedCols;x++){
      mapCtx.drawImage(IMG.f, x*TILE, y*TILE, TILE, TILE);
    }
  }

  // outside 塗り（左右3,上下4）
  for (let y=0;y<paddedRows;y++){
    for (let x=0;x<padL;x++) {
      mapCtx.drawImage(IMG.out, x*TILE, y*TILE, TILE, TILE);
      mapCtx.save();
      mapCtx.globalAlpha = 0.3;
      mapCtx.fillStyle = "#000";
      mapCtx.fillRect(x*TILE, y*TILE, TILE, TILE);
      mapCtx.restore();
    }
    for (let x=paddedCols-padR;x<paddedCols;x++) {
      mapCtx.drawImage(IMG.out, x*TILE, y*TILE, TILE, TILE);
      mapCtx.save();
      mapCtx.globalAlpha = 0.3;
      mapCtx.fillStyle = "#000";
      mapCtx.fillRect(x*TILE, y*TILE, TILE, TILE);
      mapCtx.restore();
    }
  }
  for (let y=0;y<padT;y++){
    for (let x=padL;x<paddedCols-padR;x++) {
      mapCtx.drawImage(IMG.out, x*TILE, y*TILE, TILE, TILE);
      mapCtx.save();
      mapCtx.globalAlpha = 0.3;
      mapCtx.fillStyle = "#000";
      mapCtx.fillRect(x*TILE, y*TILE, TILE, TILE);
      mapCtx.restore();
    }
  }
  for (let y=paddedRows-padB;y<paddedRows;y++){
    for (let x=padL;x<paddedCols-padR;x++) {
      mapCtx.drawImage(IMG.out, x*TILE, y*TILE, TILE, TILE);
      mapCtx.save();
      mapCtx.globalAlpha = 0.3;
      mapCtx.fillStyle = "#000";
      mapCtx.fillRect(x*TILE, y*TILE, TILE, TILE);
      mapCtx.restore();
    }
  }

  // mapを左から4,上から5（= padL, padT）に描画
  const leftOffset = padL;
  const topOffset = padT;

  // house indexカウント
  let hIndex = 0;

  for (let ry=0;ry<rows;ry++){
    const rowStr = map[ry];
    for (let rx=0;rx<cols;rx++){
      const c = rowStr[rx];
      const drawX = (rx + leftOffset) * TILE;
      const drawY = (ry + topOffset) * TILE;

      if (c === "f") {
        // ground already present
        mapCtx.save();
        mapCtx.globalAlpha = 0.3;
        mapCtx.fillStyle = "#000";
        mapCtx.fillRect(drawX, drawY, TILE, TILE);
        mapCtx.restore();
      } else if (c === "h") {
        // house
        mapCtx.drawImage(IMG.h, drawX, drawY, TILE, TILE);
        mapCtx.save();
        mapCtx.globalAlpha = 0.3;
        mapCtx.fillStyle = "#000";
        mapCtx.fillRect(drawX, drawY, TILE, TILE);
        mapCtx.restore();
        houseLoc.push({x: rx+leftOffset, y: ry+topOffset, idx: hIndex});
        hIndex++;
      } else if (c === "1" || c === "2") {
        const code = getRoadCodeAt(map, rx, ry);
        const imgToDraw = (c === "1") ? IMG.soil[code] : IMG.gravel[code];
        mapCtx.drawImage(imgToDraw, drawX, drawY, TILE, TILE);
        mapCtx.save();
        mapCtx.globalAlpha = 0.3;
        mapCtx.fillStyle = "#000";
        mapCtx.fillRect(drawX, drawY, TILE, TILE);
        mapCtx.restore();

        // 街灯条件: 上が f かつ道が左右に伸びてるケース -> 半マス上にポール&ライト
        const above = (ry-1 >= 0) ? map[ry-1][rx] : "f";
        const connectsRight = (rx+1 < cols) && (map[ry][rx+1] === "1" || map[ry][rx+1] === "2");
        const connectsLeft  = (rx-1 >= 0) && (map[ry][rx-1] === "1" || map[ry][rx-1] === "2");
        if (above === "f" && connectsRight) {
          mapCtx.drawImage(IMG.poleR, drawX, drawY - TILE*3/4, TILE, TILE);
          mapCtx.drawImage(IMG.poleLightR, drawX, drawY - TILE*3/4, TILE, TILE);
        }
        if (above === "f" && connectsLeft) {
          mapCtx.drawImage(IMG.poleL, drawX, drawY - TILE*3/4, TILE, TILE);
          mapCtx.drawImage(IMG.poleLightL, drawX, drawY - TILE*3/4, TILE, TILE);
        }
      } else if (c === "x") {
        // unpassable inside (block)
        mapCtx.drawImage(IMG.block, drawX, drawY, TILE, TILE);
        mapCtx.save();
        mapCtx.globalAlpha = 0.3;
        mapCtx.fillStyle = "#000";
        mapCtx.fillRect(drawX, drawY, TILE, TILE);
        mapCtx.restore();
      }
    }
  }
}

/* -------------------- 道接続判定（0..15） -------------------- */
function getRoadCodeAt(mapArr, tx, ty){
  // tx,ty は map 内の座標（0..cols-1）
  let code = 0;
  // 上
  if (mapArr[ty-1] && (mapArr[ty-1][tx] === "1" || mapArr[ty-1][tx] === "2" || mapArr[ty-1][tx] === "h")) code |= 1;
  // 右
  if (mapArr[ty] && (mapArr[ty][tx+1] === "1" || mapArr[ty][tx+1] === "2")) code |= 2;
  // 下
  if (mapArr[ty+1] && (mapArr[ty+1][tx] === "1" || mapArr[ty+1][tx] === "2")) code |= 4;
  // 左
  if (mapArr[ty] && (mapArr[ty][tx-1] === "1" || mapArr[ty][tx-1] === "2")) code |= 8;
  return code;
}

/* -------------------- 描画（毎フレーム） -------------------- */
function draw(){
  if (!mapCanvas) return;
  // カメラ中心をサンタ（ピクセル）に合わせる（カメラ座標は mapCanvas 空間）
  const mapW = mapCanvas.width, mapH = mapCanvas.height;
  camX = Math.floor(santaPixel.x - canvas.width / 2 + TILE/2);
  camY = Math.floor(santaPixel.y - canvas.height / 2 + TILE/2);
  camX = clamp(camX, 0, Math.max(0, mapW - canvas.width));
  camY = clamp(camY, 0, Math.max(0, mapH - canvas.height));

  // 背景（マップ切り出し）
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(mapCanvas, camX, camY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

  // 配達済みアイコンを描画（mapCanvas を直接更新してもいいが、ここでは上書き）
  for (const hinfo of houseLoc){
    const idx = hinfo.idx;
    if (housePresent[idx]) {
      const px = (hinfo.x * TILE) - camX;
      const py = (hinfo.y * TILE) - camY;
      if (IMG.present) ctx.drawImage(IMG.present, px, py, TILE, TILE);
    }
  }

  // house light overlay（もし houseLight true であれば軽くライトアイコンを重ねる）
  for (const hinfo of houseLoc){
    const idx = hinfo.idx;
    if (houseLight[idx] && !housePresent[idx]) {
      const px = (hinfo.x * TILE) - camX;
      const py = (hinfo.y * TILE) - camY;
      if (IMG.houseLightImg) ctx.drawImage(IMG.houseLightImg, px, py, TILE, TILE);
    }
  }

  // サンタ（中央寄せ）
  const drawSx = Math.floor(canvas.width / 2 - TILE/2);
  const drawSy = Math.floor(canvas.height / 2 - TILE/2);
  const sframe = 0; // 固定フレーム（アニメはここで切り替えできる）
  if (IMG.sant[sframe]) ctx.drawImage(IMG.sant[sframe], drawSx, drawSy, TILE, TILE);
  else {
    ctx.fillStyle = "#f00"; ctx.fillRect(drawSx, drawSy, TILE, TILE);
  }

  // HUD: 右上に時間・スコア表示（簡易）
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(canvas.width-220, 8, 212, 56);
  ctx.fillStyle = "#fff";
  ctx.font = "14px monospace";
  ctx.fillText(`Time: ${timeLeft}`, canvas.width-200, 28);
  ctx.fillText(`ScoreA: ${scoreA}`, canvas.width-200, 48);
}

/* -------------------- メインループ -------------------- */
function loop(){
  // 毎フレーム描画
  draw();
  requestAnimationFrame(loop);
}

//全画面画像
function drawFullImage(img){
  uictx.clearRect(0,0,canvas.width,canvas.height);
  uictx.drawImage(
    img,
    0, 0, img.width, img.height,   // 元画像の範囲
    0, 0, canvas.width, canvas.height  // キャンバスに合わせる
  );
}

/* -------------------- 移動と経過時間の処理 -------------------- */
function canEnterTile(tx, ty, dirX, dirY){
  // tx,ty are tile coords in padded map space (so relative to mapCanvas grid)
  // we need to translate mapCanvas coords back to map[] coords: leftOffset=3, topOffset=4
  const leftOffset = 3, topOffset = 4;
  const mapX = tx - leftOffset;
  const mapY = ty - topOffset;
  const check = map[mapY-dirY][mapX-dirX];
  if (check === "h") return dirY === 1;
  // bounds check
  if (mapY < 0 || mapY >= map.length || mapX < 0 || mapX >= map[0].length) return false;
  const c = map[mapY][mapX];
  if (c === "x") return false; // unpassable inside
  if (c === "f" || c === "1" || c === "2") return true;
  if (c === "h") {
    // only allow entry if moving up (dirY === -1)
    return dirY === -1;
  }
  return false;
}
function tileCharAtTileCoords(tileX, tileY){
  // convert padded map tile coords to map[] indices
  const leftOffset = 3, topOffset = 4;
  const mapX = tileX - leftOffset;
  const mapY = tileY - topOffset;
  if (mapY < 0 || mapY >= map.length || mapX < 0 || mapX >= map[0].length) return "f";
  return map[mapY][mapX];
}

function timeCostForTileChar(ch){
  const isSecondHalf = (stage >= 13);
  switch(ch){
    case "h": return moveTime.house[isSecondHalf?1:0];
    case "1": return moveTime.soil[isSecondHalf?1:0];
    case "2": return moveTime.gravel[isSecondHalf?1:0];
    case "f": default: return moveTime.ground[isSecondHalf?1:0];
  }
}

/* 実際の移動処理（タイル単位の移動） */
function attemptMove(dx, dy){
  if (moving) return;
  // current santa tile coords in padded map space:
  const leftOffset = 3, topOffset = 4;
  const curTX = santaLoc[0];
  const curTY = santaLoc[1];
  const destTX = curTX + dx;
  const destTY = curTY + dy;

  if (!canEnterTile(destTX, destTY, dx, dy)) {
    // ただし、家に入れないケース（家がある・向きが違う）はここで弾く
    return;
  }

  // get tile char of destination
  const destChar = tileCharAtTileCoords(destTX, destTY);

  // if dest is house, find which house index
  if (destChar === "h") {
    // find houseLoc matching (destTX,destTY)
    const found = houseLoc.find(h => h.x === destTX && h.y === destTY);
    const idx = found ? found.idx : null;
    if (idx !== null) {
      // if houseLight[idx] is true => 明るい家に入った -> miss ending
      if (houseLight[idx]) {
        // miss ending
        endGame("miss");
        return;
      }
      // if already delivered, disallow entering (or allow but no effect)
      if (housePresent[idx]) {
        // 入れない or 無効
        return;
      }
      // otherwise, we proceed to move and then deliver
      // cost = timeCostForTileChar("h")
      const cost = timeCostForTileChar("h");
      timeLeft = Math.max(0, timeLeft - cost);
      // mark delivered & add A score
      doDeliver(idx);
      // after deliver, check end conditions
      if (houseLeft <= 0) {
        endGame("fullpre");
      } else {
        // move santa
        santaLoc[0] = destTX; santaLoc[1] = destTY;
        santaPixel.x = santaLoc[0]*TILE; santaPixel.y = santaLoc[1]*TILE;
        // after moving, check house light updates
        updateHouseLightByTime();
      }
      return;
    } else {
      // house not found? fallback
      return;
    }
  }

  // normal tile move
  const cost = timeCostForTileChar(destChar);
  timeLeft = Math.max(0, timeLeft - cost);

  // move
  santaLoc[0] = destTX; santaLoc[1] = destTY;
  santaPixel.x = santaLoc[0]*TILE; santaPixel.y = santaLoc[1]*TILE;

  // after move updates
  updateHouseLightByTime();

  // time up check
  if (timeLeft <= 0) {
    endGame("timeup");
  }
}

/* 配達処理 */
function doDeliver(idx){
  // Aスコア計算
  let a = 0;
  if (scorex[0]) {
    // scorex[1] + (originalLimit - light-time[n])
    const lt = lightTimeArr[idx] ?? 0;
    a = scorex[1] + Math.max(0, (originalLimit - lt));
  } else {
    a = scorex[1];
  }
  scoreA += a;
  housePresent[idx] = true;
  houseLeft--;
}

/* 家のライト状態は移動のたびにチェック（仕様に沿って） */
function updateHouseLightByTime(){
  // 仕様文: もし light-time[n] が、残り時間を上回るなら そのマスをすべて消して季節のground,houseを描画
  // と書いてあるので、そのまま実装する（lt > timeLeft => redraw ground+house and clear light flag）
  for (const hinfo of houseLoc){
    const idx = hinfo.idx;
    const lt = lightTimeArr[idx] ?? Infinity;
    if (lt > timeLeft) {
      // 消灯（仕様の指示） — houseLight を false にして mapCanvas 上で再描画
      if (houseLight[idx]) {
        houseLight[idx] = false;
        // redraw that tile area: ground then house (no light overlay)
        mapCtx.drawImage(IMG.f, hinfo.x*TILE, hinfo.y*TILE, TILE, TILE);
        mapCtx.drawImage(IMG.h, hinfo.x*TILE, hinfo.y*TILE, TILE, TILE);
        mapCtx.save();
        mapCtx.globalAlpha = 0.3;
        mapCtx.fillStyle = "#000";
        mapCtx.fillRect(hinfo.x*TILE, hinfo.y*TILE, TILE, TILE);
        mapCtx.restore();
      }
    }
  }
}

/* -------------------- 終了（エンディング） -------------------- */
function endGame(kind){
  // kind: "fullpre","retire","miss","timeup"
  // スコア計算
  let Bscore = Math.floor(timeLeft * timex);

  // show result (簡易)
  let msg = "";
  if (kind === "fullpre") {
    msg = "サンタは全ての家に配り終えた…";
  }else if (kind === "retire") {
    msg = "あわてんぼうのサンタクロースは急いで次の街へと飛び出した！";
  }else if (kind === "miss") {
    msg = "サンタクロースは起きてた子供に見つかり子供と遊んでいたら朝を迎えた！";
    Bscore = 0;
  }else if (kind === "timeup") {
    msg = "サンタクロースは朝になる前に全てのプレゼントを配り切れなかった…";
    Bscore = 0;
  }
  const totalScore = scoreA + Bscore;
  alert(`${msg}\n配達スコア: ${scoreA}\nタイムボーナス: ${Bscore}\n合計: ${totalScore}`);
  // TODO: スコアをスプレッドシートに送る等
}

//ページを司るもの
function page(scene){
  if (scene === "title"){
    drawFullImage(IMG.uiTitle);
  }
  if (scene === "how-to"){

  }
  if (scene === "game"){

  }
  if (scene === "result"){

  }
}

/* -------------------- 入力イベント -------------------- */
window.addEventListener("keydown", e => {
  if (scene="game"){
    if (e.key === "ArrowUp" || e.key === "w") {
      attemptMove(0, -1);
    }
    if (e.key === "ArrowDown" || e.key === "s") {
      attemptMove(0, 1);
    }
    if (e.key === "ArrowLeft" || e.key === "a") {
      attemptMove(-1, 0);
    }
    if (e.key === "ArrowRight" || e.key === "d") {
      attemptMove(1, 0);
    }
    if (e.key === "l"){
      endGame("retire");
    }
  }
});

canvas.addEventListener("click", (e) => {
  // タップで上下左右移動させるUIは未実装。デバッグとしてstage表示
  // 画面左上クリックは退避用
});

/* -------------------- 初期実行 -------------------- */
function init(){
  stagesize();
  computeStageFromNow();

  // 名前チェック
  let playerName = localStorage.getItem("playerName");
  if (!playerName) {
    playerName = prompt("ランキングに使用する名前を入力してね！");
    if (!playerName) playerName = "ゲスト";
    localStorage.setItem("playerName", playerName);
    alert("ようこそ、" + playerName + " さん！");
  } else {
    alert("おかえり、" + playerName + " さん！");
  }

  // load stage
  loadStage(stage);
  scene = "title";
  drawFullImage(IMG.uiTitle);

  // resize リスナー
  window.addEventListener("resize", () => {
    stagesize();
  });
}

init();

function getCanvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    let x, y;

    if (evt.changedTouches) {
        const t = evt.changedTouches[0];
        x = t.clientX - rect.left;
        y = t.clientY - rect.top;
    } else {
        x = evt.clientX - rect.left;
        y = evt.clientY - rect.top;
    }
    return { x, y };
}

canvas.addEventListener("mousedown", drawRedDot);
canvas.addEventListener("touchstart", drawRedDot);

function drawRedDot(e) {
    const pos = getCanvasPos(e);

    // 小さい赤点を描画
    ctx.save();
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // pos.x,pos.yを座標割合に変換
    let perx = pos.x/canvas.width
    let pery = pos.y/canvas.height
    alert(`${perx},${pery}`)
    
}