import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { isCreativeTemplateTopic, type CreativeTemplateTopic } from "../creative-templates";

const allowedTags = new Set(["section", "article", "div", "p", "h1", "h2", "h3", "span", "strong", "em", "small", "br", "ul", "ol", "li"]);
const discardWithContents = new Set(["script", "style", "svg", "math", "iframe", "object", "embed", "form", "template", "textarea", "noscript", "audio", "video", "picture", "select", "button"]);
const MAX_HTML_LENGTH = 16_384;

// Parse as a browser would, then rebuild only explicitly permitted nodes. No source
// attributes, URL-bearing elements, executable content, or CSS are copied through.
export function sanitizeCreativeHtml(input: unknown) {
  if (typeof input !== "string" || !input.trim() || input.length > MAX_HTML_LENGTH) {
    throw new Error("Enter template HTML of no more than 16 KB.");
  }
  let visibleText = "";
  function visit(node: DefaultTreeAdapterTypes.Node): string {
    if (node.nodeName === "#text" && "value" in node) {
      visibleText += node.value;
      return escapeHtml(node.value);
    }
    if (!("tagName" in node)) return "";
    const tag = node.tagName.toLowerCase();
    if (node.namespaceURI !== "http://www.w3.org/1999/xhtml" || discardWithContents.has(tag)) return "";
    const children = "childNodes" in node ? node.childNodes.map(visit).join("") : "";
    if (!allowedTags.has(tag)) return children;
    if (tag === "br") return "<br>";
    const classValue = node.attrs.find((attribute) => attribute.name === "class")?.value ?? "";
    const safeClasses = classValue.split(/\s+/).filter((name) => /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(name)).slice(0, 6);
    const classAttribute = safeClasses.length ? ` class="${safeClasses.join(" ")}"` : "";
    return `<${tag}${classAttribute}>${children}</${tag}>`;
  }
  const html = parseFragment(input).childNodes.map(visit).join("");
  if (!visibleText.trim()) throw new Error("Template HTML needs visible text.");
  return html;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The stored ad document. `qrSvg` must come from the server's own QR
 * generator (app/lib/responses.ts), never from the person's HTML: it is the
 * one piece of markup that does not pass through the sanitizer.
 */
export function renderCreativeDocument(topic: CreativeTemplateTopic, sanitizedHtml: string, options: { qrSvg?: string } = {}) {
  if (!isCreativeTemplateTopic(topic)) throw new Error("Unknown template topic.");
  const qr = options.qrSvg && /^<svg[\s\S]*<\/svg>\s*$/.test(options.qrSvg.trim()) && !/<script|on\w+=|href=/i.test(options.qrSvg)
    ? `<aside class="ad-qr" aria-label="QR code">${options.qrSvg.trim()}<span>SCAN ME</span></aside>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>${templateCss}</style></head><body class="${topic}"><main class="artwork">${sanitizedHtml}${qr}</main></body></html>`;
}

const templateCss = `
  .ad-qr{position:absolute;z-index:9;right:3%;bottom:12%;width:13.5vw;min-width:64px;padding:.6vw .6vw .3vw;background:#fff;border-radius:.6vw;box-shadow:0 .3vw 1.2vw rgba(0,0,0,.25);text-align:center}
  .ad-qr svg{display:block;width:100%;height:auto}
  .ad-qr span{display:block;margin-top:.2vw;color:#111;font:900 clamp(6px,1vw,20px)/1.2 Arial,Helvetica,sans-serif;letter-spacing:.12em}
  *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}
  body{font-family:Arial,Helvetica,sans-serif;color:#17202a}
  .artwork{position:relative;width:100%;height:100%;overflow:hidden}
  p,h1{margin:0}h1{overflow-wrap:anywhere}em{font-style:normal}

  .retail{background:#f8cf79;color:#15242d}
  .retail .artwork{background:linear-gradient(112deg,#f9d685 0%,#ffde9f 58%,#f3bd61 100%)}
  .retail-copy{position:absolute;z-index:3;left:6%;top:10%;width:59%}
  .retail-overline{font-size:clamp(8px,1.35vw,26px);font-weight:900;letter-spacing:.15em}
  .retail h1{font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:clamp(26px,7.7vw,150px);line-height:.85;letter-spacing:-.025em;margin:2.4vw 0 1.3vw}
  .retail h1 em{color:#bb3f2b}
  .retail-detail{max-width:70%;font-size:clamp(10px,1.7vw,33px);line-height:1.2;font-weight:700}
  .retail-action{display:inline-flex;gap:1.2vw;align-items:center;border-bottom:.25vw solid #15242d;padding-bottom:.4vw;margin-top:2.4vw;font-size:clamp(8px,1.15vw,22px);font-weight:900;letter-spacing:.07em}
  .retail-action span{font-size:1.5em;line-height:.7}
  .retail-scene{position:absolute;right:0;top:0;width:44%;height:100%;z-index:1}
  .retail-sun{position:absolute;width:78%;aspect-ratio:1;right:-4%;top:3%;border-radius:50%;background:#e95a3f}
  .retail-bag{position:absolute;right:14%;bottom:11%;width:47%;height:45%;background:#173341;transform:rotate(-8deg);box-shadow:1vw 1.2vw 0 #b94731}
  .retail-bag:before{content:'';position:absolute;left:28%;top:-26%;width:46%;height:34%;border:clamp(2px,.75vw,14px) solid #173341;border-bottom:0;border-radius:50% 50% 0 0}
  .retail-bag-label{position:absolute;inset:0;display:grid;place-items:center;color:#fff2d3;font-family:Georgia,serif;font-size:clamp(15px,4vw,75px);font-weight:900}
  .retail-card{position:absolute;left:4%;bottom:26%;padding:1.3vw 1.5vw;transform:rotate(9deg);background:#fff8e8;color:#bb3f2b;font-size:clamp(7px,1.1vw,21px);line-height:1.05;letter-spacing:.08em;font-weight:900;box-shadow:.45vw .55vw 0 #173341}
  .retail-foot{position:absolute;z-index:4;left:6%;right:6%;bottom:4%;display:flex;justify-content:space-between;gap:1vw;border-top:1px solid #173341;padding-top:.7vw;font-size:clamp(8px,1vw,20px);font-weight:900;letter-spacing:.1em}

  .finance{background:#e8f1e9;color:#17362f}
  .finance .artwork{background:linear-gradient(113deg,#f5f8ee 4%,#e4efe5 63%,#c4e0d3 100%)}
  .finance-copy{position:absolute;left:6.5%;top:7%;z-index:3;width:64%}
  .finance-brand{display:flex;align-items:center;gap:1vw;font-size:clamp(9px,1.5vw,29px);font-weight:900;letter-spacing:.13em}
  .finance-mark{display:grid;place-items:center;width:2.6vw;height:2.6vw;min-width:15px;min-height:15px;background:#216e55;color:#fff;border-radius:50%;font-family:Georgia,serif;font-size:clamp(11px,1.7vw,34px);letter-spacing:0}
  .finance-overline{margin-top:5.5vw;color:#26775b;font-size:clamp(8px,1.2vw,23px);font-weight:900;letter-spacing:.19em}
  .finance h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(25px,6.5vw,126px);line-height:.98;letter-spacing:-.065em;margin:1.1vw 0}
  .finance h1 em{color:#23845f}
  .finance-detail{max-width:68%;font-size:clamp(10px,1.75vw,34px);line-height:1.25}
  .finance-action{display:inline-flex;align-items:center;gap:1.2vw;margin-top:2.2vw;color:#216e55;font-size:clamp(8px,1.1vw,21px);font-weight:900;letter-spacing:.12em}
  .finance-action span{font-size:1.5em;line-height:.7}
  .finance-art{position:absolute;right:-7%;top:-17%;width:53%;aspect-ratio:1;z-index:1}
  .finance-ring{position:absolute;border:clamp(3px,1.5vw,29px) solid #a8d2bf;border-radius:50%;inset:0}
  .finance-ring.ring-two{inset:17%;border-color:#78b69c}
  .finance-ring.ring-three{inset:34%;border-color:#377c60}
  .finance-dot{position:absolute;right:12%;bottom:10%;width:13%;aspect-ratio:1;border-radius:50%;background:#e6b452}
  .finance-foot{position:absolute;left:6.5%;right:6.5%;bottom:5%;border-top:1px solid #6a9c83;padding-top:.8vw;color:#216e55;font-size:clamp(8px,1.05vw,20px);font-weight:900;letter-spacing:.15em}

  .event{background:#171531;color:#fff4df}
  .event .artwork{background:linear-gradient(110deg,#171531 0%,#27204a 68%,#47284c 100%)}
  .event-copy{position:absolute;left:6%;top:9%;z-index:3;width:65%}
  .event-overline{color:#ffae6b;font-size:clamp(8px,1.35vw,26px);font-weight:900;letter-spacing:.18em}
  .event h1{font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:clamp(30px,9vw,175px);line-height:.86;letter-spacing:.005em;margin:2vw 0 1.6vw}
  .event h1 em{color:#ff6e59}
  .event-detail{font-size:clamp(11px,2vw,39px);font-weight:800;line-height:1.15}
  .event-action{display:flex;gap:1.5vw;align-items:center;margin-top:2.1vw;font-size:clamp(9px,1.35vw,26px);font-weight:900;letter-spacing:.09em}
  .event-action span{border-left:1px solid #ffae6b;padding-left:1.5vw;color:#ffae6b}
  .event-art{position:absolute;right:0;top:0;width:44%;height:100%;overflow:hidden}
  .event-orb{position:absolute;right:2%;top:8%;width:75%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 38% 35%,#ffd79b 0%,#ff9c68 35%,#e95555 68%,#9a3761 100%);box-shadow:0 0 8vw #fc6f6569}
  .event-streak{position:absolute;width:150%;height:clamp(2px,.7vw,13px);background:#ffca7e;transform:rotate(-35deg);transform-origin:left center;opacity:.8}
  .event-streak.streak-one{left:10%;top:63%}.event-streak.streak-two{left:-9%;top:76%;background:#f26468}.event-streak.streak-three{left:32%;top:87%;background:#9b8dda}
  .event-foot{position:absolute;left:6%;right:6%;bottom:5%;display:flex;justify-content:space-between;gap:1vw;border-top:1px solid #ffae6b;padding-top:.7vw;color:#ffca88;font-size:clamp(8px,1.05vw,20px);font-weight:900;letter-spacing:.12em}

  @media(max-width:240px){
    .retail-detail,.retail-action,.finance-detail,.finance-action,.event-detail,.event-action{display:none}
    .retail-foot,.finance-foot,.event-foot,.retail-card,.finance-brand{display:none}
    .retail h1,.event h1{font-size:9vw}
    .finance h1{font-size:7.5vw}
    .finance-overline{margin-top:2vw}
  }
`;
