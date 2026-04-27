require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
// const Tesseract = require("tesseract.js");
// const vision = require("@google-cloud/vision");
// const client = new vision.ImageAnnotatorClient({
//   keyFilename: path.join(__dirname, "credentials.json")
// });

const fetch = require("node-fetch");
const VISION_API_KEY = process.env.VISION_API_KEY;

const app = express();
const port = process.env.PORT;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function makeTempDir() {
  const dir = path.join(os.tmpdir(), "pill-pouch-reader");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, makeTempDir()),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".jpg").slice(0, 10);
      const name = crypto.randomBytes(16).toString("hex");
      cb(null, `${name}${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const EASY_KOREAN_DICT = [
  // 복용 관련
  { hard: /1일\s*([0-9]+)\s*회/g, easy: "하루 $1번" },
  { hard: /1일/g, easy: "하루" },
  { hard: /매일/g, easy: "날마다" },
  { hard: /식전/g, easy: "밥 먹기 전" },
  { hard: /식후/g, easy: "밥 먹고 나서" },
  { hard: /공복/g, easy: "아무것도 안 먹은 상태" },
  { hard: /취침\s*전/g, easy: "자기 전" },
  { hard: /복용/g, easy: "먹기" },
  { hard: /경구\s*투여/g, easy: "입으로 먹기" },
  { hard: /1정/g, easy: "한 알" },
  { hard: /2정/g, easy: "두 알" },
  { hard: /(\d+)\s*정/g, easy: "$1알" },
  { hard: /1캡슐/g, easy: "한 캡슐" },
  { hard: /(\d+)\s*캡슐/g, easy: "$1캡슐" },
  { hard: /1포/g, easy: "한 봉지" },
  { hard: /(\d+)\s*포/g, easy: "$1봉지" },
  { hard: /용법/g, easy: "먹는 방법" },
  { hard: /용량/g, easy: "먹는 양" },
  // 주의 문구
  { hard: /금기/g, easy: "하면 안 됨" },
  { hard: /주의/g, easy: "조심" },
  { hard: /이상반응/g, easy: "몸에 이상한 반응" },
  { hard: /부작용/g, easy: "몸에 안 좋은 반응" },
  { hard: /어지러움/g, easy: "어지러움(빙빙 도는 느낌)" }
];

function normalizeWhitespace(s) {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function simplifyKoreanTerms(text) {
  let out = text;
  for (const rule of EASY_KOREAN_DICT) out = out.replace(rule.hard, rule.easy);

  // 흔한 OCR 오탈자/기호 교정(가볍게)
  out = out
    .replace(/O/g, "0")
    .replace(/[·•]/g, " ")
    .replace(/[:,]/g, " ")
    .replace(/[ ]{2,}/g, " ");

  return normalizeWhitespace(out);
}

function extractHelpfulLines(text) {
  const lines = normalizeWhitespace(text).split("\n");
  const keep = [];
  const patterns = [
    /하루\s*\d+\s*번/,
    /밥\s*먹기\s*(전|후)/,
    /자기\s*전/,
    /(\d+)\s*(알|봉지|캡슐)/,
    /(아침|점심|저녁)/,
    /(조심|하면 안 됨|몸에 안 좋은 반응)/
  ];

  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    if (patterns.some((p) => p.test(l))) keep.push(l);
  }
  return keep.slice(0, 12);
}

app.post("/api/ocr", upload.single("image"), async (req, res) => {
  const filePath = req.file?.path;
  if (!filePath) {
    return res.status(400).json({ error: "사진 파일이 없어요. 다시 올려주세요." });
  }

  const lang = (req.body?.lang || "kor").toString();
  const ocrLang = ["kor", "kor+eng", "eng"].includes(lang) ? lang : "kor";

  try {
    // const result = await Tesseract.recognize(filePath, ocrLang, {
    //   logger: () => {}
    // });

    // const rawText = normalizeWhitespace(result?.data?.text || "");
    
    // Vision API로 교체
    // const [result] = await client.textDetection(filePath);
    // const detections = result.textAnnotations;
    // const rawText = normalizeWhitespace(
    //   detections?.[0]?.description || ""
    // );
    // REST API 방식으로 교체
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString("base64");

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: "TEXT_DETECTION" }]
          }]
        })
      }
    );

    const visionResult = await response.json();
    const rawText = normalizeWhitespace(
      visionResult.responses?.[0]?.fullTextAnnotation?.text || ""
    );
    
    const easyText = simplifyKoreanTerms(rawText);
    const highlights = extractHelpfulLines(easyText);

    res.json({
      rawText,
      easyText,
      highlights
    });
  } catch (e) {
    console.error("Vision error응답:", JSON.stringify(visionResult));
    res.status(500).json({
      error: "사진에서 글씨를 읽는 중에 문제가 생겼어요. 더 밝게 찍어서 다시 올려주세요."
    });
  } finally {
    fs.promises.unlink(filePath).catch(() => {});
  }
});

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`pill-pouch-reader running on http://localhost:${port}`);
});

