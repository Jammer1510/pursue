export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "pursue-locale";

export function isLocale(s: string | undefined | null): s is Locale {
  return s === "en" || s === "zh";
}

export function pickField(
  record: unknown,
  key: string,
  locale: Locale,
): string | null {
  if (!record || typeof record !== "object") return null;
  const r = record as Record<string, unknown>;
  if (locale === "zh") {
    const zh = r[`${key}_zh`];
    if (typeof zh === "string" && zh.trim().length > 0) return zh;
  }
  const en = r[key];
  return typeof en === "string" ? en : en == null ? null : String(en);
}

export function pickArray(
  record: unknown,
  key: string,
  locale: Locale,
): string[] {
  if (!record || typeof record !== "object") return [];
  const r = record as Record<string, unknown>;
  const en = Array.isArray(r[key]) ? (r[key] as string[]) : [];
  if (locale === "zh") {
    const zhRaw = r[`${key}_zh`];
    const zh = Array.isArray(zhRaw) ? (zhRaw as string[]) : [];
    if (zh.length === en.length && zh.some((s) => typeof s === "string" && s.trim())) {
      return zh.map((s, i) => (typeof s === "string" && s.trim() ? s : en[i] ?? ""));
    }
  }
  return en;
}

export const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    "nav.timeline": "Timeline",
    "nav.browse": "Browse",
    "nav.map": "Map",
    "nav.connections": "Connections",
    "panel.placeholder": "Click a pin to view details. Click another pin anytime — no need to close.",
    "panel.clear": "Clear ✕",
    "panel.loading": "loading…",
    "panel.noSelection": "no selection",
    "detail.bust": "Bust assessment",
    "detail.coverup": "Cover-up signal",
    "detail.summary": "Summary",
    "detail.object": "Object",
    "detail.behavior": "Behavior",
    "detail.resolution": "Resolution",
    "detail.docType": "Document type",
    "detail.claims": "Key claims",
    "detail.sensors": "Sensors",
    "detail.witnesses": "Witnesses",
    "detail.openPdf": "Open original PDF →",
    "detail.thumbnail": "Thumbnail",
    "detail.fullText": "Full document text",
    "detail.tags": "Tags",
    "bust.unassessed": "Unassessed",
    "bust.mundane": "likely mundane",
    "bust.uncertain": "uncertain",
    "bust.weird": "weird",
    "coverup.none": "no concealment",
    "coverup.routine": "routine",
    "coverup.heavy": "concealment",
    "coverup.extreme": "extreme concealment",
    "coverup.unassessed": "Unassessed",
    "conn.title": "Connections / Investigate",
    "conn.tagline": "Pick tags across categories. Events matching ALL selected tags appear on the right.",
    "conn.filter": "filter tags…",
    "conn.clearAll": "Clear all",
    "conn.noSelected": "No tags selected",
    "conn.empty": "No events match all selected tags. Try removing one to widen the search.",
    "conn.cta": "Pick tags on the left to find events that share descriptors across time and place.",
    "drawer.offMap": "Off-map events",
    "drawer.offEarth": "Off-Earth",
    "drawer.noPrecise": "No precise location",
    "chat.open": "Ask the archive",
    "chat.title": "Archive assistant",
    "chat.placeholder": "Ask about a record, agency, year, or pattern…",
    "chat.send": "Send",
    "chat.clear": "Clear",
    "chat.thinking": "thinking…",
    "chat.empty": "Ask anything about the 120 declassified records. Citations link to the source.",
    "chat.suggested.1": "What records have the strongest anomalous evidence?",
    "chat.suggested.2": "Show me FBI records about flying discs",
    "chat.suggested.3": "Which Apollo mission records mention UAP?",
    "chat.suggested.4": "Find records with high cover-up signal but unclear evidence",
    "chat.error.rate": "Rate limit reached. Try again later.",
    "chat.error.config": "Chatbot is not configured yet. Set GEMINI_API_KEY in Vercel.",
    "chat.error.network": "Network error. Check your connection and try again.",
    "chat.error.generic": "Something went wrong. Try again.",
  },
  zh: {
    "nav.timeline": "时间线",
    "nav.browse": "浏览",
    "nav.map": "地图",
    "nav.connections": "关联",
    "panel.placeholder": "点击地图上的标记查看详情。可随时点击其他标记切换，无需关闭。",
    "panel.clear": "清除 ✕",
    "panel.loading": "加载中…",
    "panel.noSelection": "未选择",
    "detail.bust": "可解释性评估",
    "detail.coverup": "掩盖信号",
    "detail.summary": "摘要",
    "detail.object": "物体描述",
    "detail.behavior": "行为",
    "detail.resolution": "官方结论",
    "detail.docType": "文档类型",
    "detail.claims": "关键陈述",
    "detail.sensors": "传感器",
    "detail.witnesses": "目击者",
    "detail.openPdf": "查看原始 PDF →",
    "detail.thumbnail": "缩略图",
    "detail.fullText": "完整文档文本",
    "detail.tags": "标签",
    "bust.unassessed": "未评估",
    "bust.mundane": "很可能可解释",
    "bust.uncertain": "存疑",
    "bust.weird": "异常",
    "coverup.none": "无掩盖",
    "coverup.routine": "常规处理",
    "coverup.heavy": "明显掩盖",
    "coverup.extreme": "重度掩盖",
    "coverup.unassessed": "未评估",
    "conn.title": "关联 / 调查",
    "conn.tagline": "跨类别选择标签。同时匹配所有标签的事件将显示在右侧。",
    "conn.filter": "过滤标签…",
    "conn.clearAll": "清除全部",
    "conn.noSelected": "未选择标签",
    "conn.empty": "没有事件同时匹配所有标签。尝试减少标签以扩大搜索范围。",
    "conn.cta": "在左侧选择标签，发现跨时空共享特征的事件。",
    "drawer.offMap": "地图外事件",
    "drawer.offEarth": "地外",
    "drawer.noPrecise": "无精确位置",
    "chat.open": "询问档案",
    "chat.title": "档案助手",
    "chat.placeholder": "询问任意记录、机构、年份或模式…",
    "chat.send": "发送",
    "chat.clear": "清除",
    "chat.thinking": "思考中…",
    "chat.empty": "随时询问 120 份解密记录。引用会链接到原始资料。",
    "chat.suggested.1": "哪些记录的异常证据最强？",
    "chat.suggested.2": "显示 FBI 关于飞碟的记录",
    "chat.suggested.3": "哪些阿波罗任务记录提到了 UAP？",
    "chat.suggested.4": "找出掩盖信号高但证据不明确的记录",
    "chat.error.rate": "已达请求频率上限，请稍后再试。",
    "chat.error.config": "聊天机器人尚未配置。请在 Vercel 中设置 GEMINI_API_KEY。",
    "chat.error.network": "网络错误，请检查连接后重试。",
    "chat.error.generic": "发生错误，请重试。",
  },
};

export function t(key: string, locale: Locale): string {
  return STRINGS[locale][key] ?? STRINGS[DEFAULT_LOCALE][key] ?? key;
}
