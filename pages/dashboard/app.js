const bridge = window.AstrBotPluginPage;

const $ = (id) => document.getElementById(id);

let context = null;
let toastTimer = null;
let personas = [];
let editingPersonaId = null;
let ttsVoices = [];
let astrbotCurrentPersonaName = "";

// 兜底音色表（后端未返回时使用，与后端 TTS_VOICES 保持一致的中文描述）
const FALLBACK_TTS_VOICES = [
  { value: "冰糖", label: "冰糖 · 中文女声", group: "", lang: "zh-CN", gender: "F", desc: "活泼少女，清甜温柔" },
  { value: "茉莉", label: "茉莉 · 中文女声", group: "", lang: "zh-CN", gender: "F", desc: "知性女声，温婉甜美" },
  { value: "苏打", label: "苏打 · 中文男声", group: "", lang: "zh-CN", gender: "M", desc: "阳光少年，活力阳光" },
  { value: "白桦", label: "白桦 · 中文男声", group: "", lang: "zh-CN", gender: "M", desc: "成熟男声，沉稳大气" },
  { value: "Mia", label: "Mia · 英文女声", group: "", lang: "en-US", gender: "F", desc: "英文女声，温柔甜美" },
  { value: "Chloe", label: "Chloe · 英文女声", group: "", lang: "en-US", gender: "F", desc: "英文女声，自然流畅" },
  { value: "Milo", label: "Milo · 英文男声", group: "", lang: "en-US", gender: "M", desc: "英文男声，阳光活力" },
  { value: "Dean", label: "Dean · 英文男声", group: "", lang: "en-US", gender: "M", desc: "英文男声，专业沉稳" },
];

function showToast(msg, isError = false, isSuccess = false, redText = false) {
  const toast = $("toast");
  let text = msg;
  let bg = isError ? "var(--red)" : "var(--card)";
  let color = isError ? "#fff" : "var(--text)";
  if (isSuccess) {
    text = "✅ " + msg;
    bg = "var(--green)";
    color = "#fff";
  } else if (redText) {
    text = "❌ " + msg;
    color = "var(--red)";
  }
  toast.textContent = text;
  toast.style.background = bg;
  toast.style.color = color;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setSwitch(id, on) {
  const el = $(id);
  if (el) el.checked = Boolean(on);
}

function syncPersonaSelectionDisabled() {
  const disabled = $("use_astrbot_default_persona").checked;
  $("btnSelectPersona").disabled = disabled;
  $("persona").disabled = disabled;
}

function confirmDialog(message) {
  return new Promise((resolve) => {
    const modal = $("confirmModal");
    $("confirmText").textContent = message;
    modal.classList.add("show");
    const ok = $("confirmOk");
    const cancel = $("confirmCancel");
    const finish = (result) => {
      modal.classList.remove("show");
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
  });
}

function renderStatus(status) {
  const pills = $("statusPills");
  pills.innerHTML = "";
  const ffmpegWarn = $("ffmpegWarn");
  if (ffmpegWarn) ffmpegWarn.style.display = status.ffmpeg_installed ? "none" : "block";
  const eff = $("effectiveModel");
  if (eff) eff.textContent = status.chat_model || status.model || "未配置";
  const effV = $("effectiveVisionModel");
  if (effV) effV.textContent = status.vision_model || "未配置";
  const ww = $("current_wake_words");
  if (ww) {
    const prefixes = Array.isArray(status.at_prefixes) ? status.at_prefixes : [];
    ww.textContent = prefixes.length ? prefixes.join("、") : "未读取";
  }
  const items = [
    { label: "总开关", on: status.chat_enable },
    { label: "TTS 语音", on: status.tts_enable },
    { label: "ffmpeg", on: status.ffmpeg_installed },
    { label: "长期记忆", on: status.long_memory },
    { label: `人格 · ${status.persona_name || "未设置"}`, on: true },
    { label: "好感度", on: status.favorability },
  ];
  items.forEach((it) => {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.innerHTML = `<span class="dot ${it.on ? "on" : "off"}"></span>${escapeHtml(it.label)}`;
    pills.appendChild(pill);
  });
}

// ===================== 人格库管理 =====================

function fillAstrbotPersonaSelect(selected, list) {
  const sel = $("astrbot_persona");
  sel.innerHTML = "";
  const follow = document.createElement("option");
  follow.value = "";
  follow.textContent = "跟随AstrBot配置文件当前人格";
  sel.appendChild(follow);
  (Array.isArray(list) ? list : []).forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = p.name || "(未命名)";
    sel.appendChild(opt);
  });
  if (selected) sel.value = selected;
}

function fillPersonaSelect(selected) {
  const sel = $("persona");
  sel.innerHTML = "";
  personas.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name}${p.description ? "（" + p.description + "）" : ""}`;
    sel.appendChild(opt);
  });
  if (selected) sel.value = selected;
  if (!sel.value && personas.length) sel.value = personas[0].id;
}

function updateCurrentPersonaName(name) {
  const el = $("currentPersonaName");
  if (el) el.textContent = name || "-";
}

function refreshCurrentPersonaName(config) {
  const c = config || {};
  astrbotCurrentPersonaName = c.astrbot_current_persona || "";
  if (c.use_astrbot_default_persona) {
    if (!c.astrbot_persona) {
      updateCurrentPersonaName(astrbotCurrentPersonaName || "跟随AstrBot配置（当前人格）");
      return;
    }
    const sel = $("astrbot_persona");
    updateCurrentPersonaName(sel && sel.value ? sel.value : astrbotCurrentPersonaName || "跟随AstrBot配置（当前人格）");
    return;
  }
  const pid = c.persona;
  const p = (Array.isArray(c.personas) ? c.personas : []).find((x) => x.id === pid);
  updateCurrentPersonaName(p ? p.name : "-");
}

function renderPersonas(current) {
  const list = $("personaList");
  if (!personas.length) {
    list.innerHTML = '<div class="empty">暂无人格，点击下方按钮新增</div>';
    return;
  }
  list.innerHTML = "";
  personas.forEach((p) => {
    const row = document.createElement("div");
    row.className = "persona-row";
    const badges = [];
    if (p.builtin) badges.push('<span class="badge">预设</span>');
    if (p.id === current) badges.push('<span class="badge current-badge">当前</span>');
    const delBtn = `<button class="btn danger small" data-del="${p.id}">删除</button>`;
    const editBtn = `<button class="btn secondary small" data-edit="${p.id}">编辑</button>`;
    row.innerHTML = `
      <div class="top">
        <div>
          <span class="pname">${escapeHtml(p.name)}${badges.join("")}</span>
          <div class="desc">${escapeHtml(p.description || "")}</div>
        </div>
        <div class="opts">${editBtn}${delBtn}</div>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openPersonaForm(btn.dataset.edit));
  });
  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => deletePersona(btn.dataset.del));
  });
}

function openPersonaForm(id = null) {
  editingPersonaId = id;
  const form = $("personaForm");
  form.classList.add("show");
  if (id) {
    const p = personas.find((x) => x.id === id);
    if (p) {
      $("pf_name").value = p.name || "";
      $("pf_desc").value = p.description || "";
      $("pf_prompt").value = p.prompt || "";
    }
  } else {
    $("pf_name").value = "";
    $("pf_desc").value = "";
    $("pf_prompt").value = "";
  }
  $("pf_name").focus();
}

function closePersonaForm() {
  $("personaForm").classList.remove("show");
  editingPersonaId = null;
}

async function loadPersonas() {
  try {
    const data = await bridge.apiGet("personas");
    personas = (data && data.list) || [];
    fillPersonaSelect(data && data.current);
    renderPersonas(data && data.current);
    if ($("use_astrbot_default_persona").checked) {
      if (!$("astrbot_persona").value) {
        updateCurrentPersonaName(astrbotCurrentPersonaName || "跟随AstrBot配置（当前人格）");
      }
    } else {
      const p = personas.find((x) => x.id === (data && data.current));
      updateCurrentPersonaName(p ? p.name : "-");
    }
  } catch (e) {
    $("personaList").innerHTML = `<div class="empty">人格加载失败：${escapeHtml(e.message)}</div>`;
  }
}

async function deletePersona(id) {
  const p = personas.find((x) => x.id === id);
  const ok = await confirmDialog(`确定删除人格「${p ? p.name : id}」吗？`);
  if (!ok) return;
  try {
    await bridge.apiPost("personas/delete", { id });
    showToast("✅ 人格已删除");
    await Promise.all([loadPersonas(), loadStatus()]);
  } catch (e) {
    showToast("删除失败：" + e.message, true);
  }
}

// ===================== 配置 =====================

// API Key 掩码占位（保存后以圆点显示，不展示明文）
const API_KEY_MASK = "••••••••••••";

// 记录自定义 API Key 是否已保存（真实 Key 仅在本页会话内临时存在，保存后一律掩码显示）
let apiKeySet = false;

// 记录 TTS API Key 是否已保存（同上掩码处理）
let ttsApiKeySet = false;

function applyApiKeyMask(showMask) {
  $("api_key").value = showMask ? API_KEY_MASK : "";
  $("api_key").placeholder = showMask ? "已保存，输入新 Key 可替换" : "";
}

function applyTtsApiKeyMask(showMask) {
  $("tts_api_key").value = showMask ? API_KEY_MASK : "";
  $("tts_api_key").placeholder = showMask ? "已保存，输入新 Key 可替换" : "";
}

function collectConfig() {
  return {
    chat_model_enable: $("chat_model_enable").checked,
    custom_model_enable: $("custom_model_enable").checked,
    vision_model_enable: $("vision_model_enable").checked,
    api_base_url: $("api_base_url").value.trim(),
    api_key: $("api_key").value.trim(),
    chat_model: $("chat_model").value.trim(),
    vision_model: $("vision_model").value.trim(),
    persona: $("persona").value,
    hide_ai_identity: $("hide_ai_identity").checked,
    use_astrbot_default_persona: $("use_astrbot_default_persona").checked,
    astrbot_persona: $("astrbot_persona").value,
    enable_long_memory: $("enable_long_memory").checked,
    auto_save_memory: $("auto_save_memory").checked,
    group_image_reply: $("group_image_reply").checked,
    enable_emoji_analysis: $("enable_emoji_analysis").checked,
    enable_facial_expression: $("enable_facial_expression").checked,
    ignore_mention_others: $("ignore_mention_others").checked,
    enable_proactive_chat: $("enable_proactive_chat").checked,
    enable_noprefix_command: $("enable_noprefix_command").checked,
    enable_favorability: $("enable_favorability").checked,
    enable_private_companion: $("enable_private_companion").checked,
    master_user_ids: ($("master_user_ids").value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    avoid_intimate_non_master: $("avoid_intimate_non_master").checked,
    tts_enable: $("tts_enable").checked,
    tts_mode: $("tts_mode").value,
    tts_api_base_url: $("tts_api_base_url").value.trim(),
    tts_api_key: $("tts_api_key").value.trim(),
    tts_model: $("tts_model").value.trim(),
    tts_voice: $("tts_voice").value,
    tts_speed: parseFloat($("tts_speed").value) || 1.0,
    tts_emotion: $("tts_emotion").value,
    tts_style: $("tts_style").value,
    tts_rhythm: $("tts_rhythm").value,
    tts_paralanguage: $("tts_paralanguage").value,
    tts_sing_enable: $("tts_sing_enable").checked,
    tts_sing_director: $("tts_sing_director").value,
    tts_sing_director_preset: $("tts_sing_director_preset").value,
    tts_sing_inline_tags: $("tts_sing_inline_tags").checked,
    tts_sing_format: $("tts_sing_format").value,
    tts_sing_voice: $("tts_sing_voice").value,
    memory_recall_count: parseInt($("memory_recall_count").value, 10) || 3,
    session_expire_seconds: parseInt($("session_expire_seconds").value, 10) || 120,
    max_log: parseInt($("max_log").value, 10) || 14,
    on_thinking: $("on_thinking").value === "true",
    proactive_chat_frequency: parseInt($("proactive_chat_frequency").value, 10) || 10,
    favorability_default: parseInt($("favorability_default").value, 10) || 50,
  };
}

function fillVoices(selected) {
  const sel = $("tts_voice");
  if (!sel) return;
  sel.innerHTML = "";
  const list = ttsVoices.length ? ttsVoices : FALLBACK_TTS_VOICES;
  list.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.value;
    opt.textContent = v.label + (v.desc ? " · " + v.desc : "");
    sel.appendChild(opt);
  });
  if (selected) sel.value = selected;
  else if (sel.options.length) sel.value = sel.options[0].value;
}

function fillSingVoices(selected) {
  const sel = $("tts_sing_voice");
  if (!sel) return;
  sel.innerHTML = "";
  const follow = document.createElement("option");
  follow.value = "";
  follow.textContent = "跟随普通语音音色";
  sel.appendChild(follow);
  const list = ttsVoices.length ? ttsVoices : FALLBACK_TTS_VOICES;
  list.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.value;
    opt.textContent = v.label + (v.desc ? " · " + v.desc : "");
    sel.appendChild(opt);
  });
  if (selected) sel.value = selected;
  else sel.value = "";
}

async function saveConfigKeys(keys, btn) {
  const all = collectConfig();
  const payload = {};
  keys.forEach((k) => {
    if (k in all) payload[k] = all[k];
  });
  btn.disabled = true;
  try {
    await bridge.apiPost("config/save", payload);
    if ("api_key" in payload) {
      // 保存后立即掩码显示，避免真实 Key 停留在输入框
      const v = $("api_key").value.trim();
      apiKeySet = v !== "";
      applyApiKeyMask(apiKeySet);
    }
    if ("tts_api_key" in payload) {
      const v = $("tts_api_key").value.trim();
      ttsApiKeySet = v !== "";
      applyTtsApiKeyMask(ttsApiKeySet);
    }
    showToast("✅ 配置已保存");
    loadStatus();
  } catch (e) {
    showToast("保存失败：" + e.message, true);
  } finally {
    btn.disabled = false;
  }
}

function applyConfig(config) {
  $("api_base_url").value = config.api_base_url || config.chat_api_base_url || "";
  // API Key 掩码显示：已配置则以圆点占位，避免明文展示
  apiKeySet = Boolean(config.api_key_set);
  applyApiKeyMask(apiKeySet);
  $("chat_model").value = config.chat_model || "";
  $("vision_model").value = config.vision_model || "";
  setSwitch("chat_model_enable", config.chat_model_enable);
  setSwitch("custom_model_enable", config.custom_model_enable);
  setSwitch("vision_model_enable", config.vision_model_enable);
  updateCustomModelFields();
  if (Array.isArray(config.personas)) {
    personas = config.personas;
    fillPersonaSelect(config.persona);
    renderPersonas(config.persona);
  }
  setSwitch("hide_ai_identity", config.hide_ai_identity);
  setSwitch("use_astrbot_default_persona", config.use_astrbot_default_persona);
  fillAstrbotPersonaSelect(config.astrbot_persona, config.astrbot_personas);
  refreshCurrentPersonaName(config);
  syncPersonaSelectionDisabled();
  setSwitch("enable_long_memory", config.enable_long_memory);
  setSwitch("auto_save_memory", config.auto_save_memory);
  setSwitch("group_image_reply", config.group_image_reply);
  setSwitch("enable_emoji_analysis", config.enable_emoji_analysis);
  setSwitch("enable_facial_expression", config.enable_facial_expression);
  setSwitch("ignore_mention_others", config.ignore_mention_others);
  setSwitch("enable_proactive_chat", config.enable_proactive_chat);
  setSwitch("enable_noprefix_command", config.enable_noprefix_command);
  setSwitch("enable_favorability", config.enable_favorability);
  setSwitch("enable_private_companion", config.enable_private_companion);
  $("master_user_ids").value = (config.master_user_ids || []).join(",");
  setSwitch("avoid_intimate_non_master", config.avoid_intimate_non_master);
  if (Array.isArray(config.tts_voices)) {
    ttsVoices = config.tts_voices;
  }
  setSwitch("tts_enable", config.tts_enable);
  $("tts_mode").value = config.tts_mode || "text_voice";
  $("tts_api_base_url").value = config.tts_api_base_url || "https://api.xiaomimimo.com/v1";
  // TTS API Key 掩码显示：已配置则以圆点占位，避免明文展示
  ttsApiKeySet = Boolean(config.tts_api_key_set);
  applyTtsApiKeyMask(ttsApiKeySet);
  $("tts_model").value = config.tts_model || "mimo-v2.5-tts";
  fillVoices(config.tts_voice);

   $("tts_speed").value = config.tts_speed || 1.0;
   const speedVal = parseFloat(config.tts_speed) || 1.0;
   $("tts_speed_value").textContent = speedVal.toFixed(1);
   $("tts_emotion").value = config.tts_emotion || "";
   $("tts_style").value = config.tts_style || "";
   $("tts_rhythm").value = config.tts_rhythm || "";
   $("tts_paralanguage").value = config.tts_paralanguage || "";
    setSwitch("tts_sing_enable", config.tts_sing_enable);
    $("tts_sing_director").value = config.tts_sing_director || "";
    $("tts_sing_director_preset").value = config.tts_sing_director_preset || "basic";
    syncSingDirectorVisibility();
    setSwitch("tts_sing_inline_tags", config.tts_sing_inline_tags !== false);
    $("tts_sing_format").value = config.tts_sing_format || "mp3";
    fillSingVoices(config.tts_sing_voice);
   $("memory_recall_count").value = config.memory_recall_count || 3;
  $("session_expire_seconds").value = config.session_expire_seconds || 120;
  $("max_log").value = config.max_log || 14;
  $("on_thinking").value = config.on_thinking ? "true" : "false";
  $("proactive_chat_frequency").value = config.proactive_chat_frequency || 10;
  $("favorability_default").value = config.favorability_default || 50;
}

function syncSingDirectorVisibility() {
  const preset = $("tts_sing_director_preset").value;
  const field = $("tts_sing_director_field");
  if (field) field.style.display = preset === "custom" ? "" : "none";
}

function updateCustomModelFields() {
  const enabled = $("custom_model_enable").checked;
  ["api_base_url", "api_key", "chat_model", "vision_model"].forEach((id) => {
    $(id).disabled = !enabled;
  });
  const btn = $("btnTestAstrbot");
  if (btn) btn.disabled = enabled;
}

async function testModelStatus(target, btn) {
  const result = $("modelTestResult");
  if (!result) return;
  btn.disabled = true;
  btn.textContent = target === "custom" ? "自定义模型测试中…" : "AstrBot 模型测试中…";
  result.style.display = "none";
  result.innerHTML = "";
  try {
    const res = await bridge.apiPost("model_status", { target });
    const items = Array.isArray(res && res.items) ? res.items : [];
    result.style.display = "block";
    if (items.length === 0) {
      result.innerHTML = `<div class="model-test-item"><span class="model-test-name">-</span><span class="model-test-msg">无可用模型</span></div>`;
      showToast("模型没有打开", true);
    } else {
      result.innerHTML = items
        .map((it) => {
          const ok = it.connected;
          const cls = ok ? "ok" : it.enabled ? "fail" : "off";
          return (
            `<div class="model-test-item ${cls}">` +
            `<span class="model-test-name">${escapeHtml(it.name)}</span>` +
            (it.model ? `<span class="model-test-model">${escapeHtml(it.model)}</span>` : "") +
            `<span class="model-test-msg">${escapeHtml(it.message || "")}</span>` +
            `</div>`
          );
        })
        .join("");
      const anyOk = items.some((it) => it.connected);
      if (anyOk) showToast("模型连接正常", false, true);
      else showToast("模型连接失败，请检查配置", true);
    }
  } catch (e) {
    result.style.display = "block";
    result.innerHTML = `<div class="model-test-item fail"><span class="model-test-name">-</span><span class="model-test-msg">${escapeHtml(e.message || "请求失败")}</span></div>`;
    showToast("测试失败：" + (e.message || ""), true);
  } finally {
    btn.disabled = target === "astrbot" && $("custom_model_enable").checked;
    btn.textContent = target === "custom" ? "自定义模型测试" : "AstrBot 模型测试";
  }
}

async function loadStatus() {
  try {
    const status = await bridge.apiGet("status");
    renderStatus(status);
  } catch (e) {
    console.error(e);
    const eff = $("effectiveModel");
    if (eff) eff.textContent = "加载失败";
    const effV = $("effectiveVisionModel");
    if (effV) effV.textContent = "加载失败";
  }
}

// ===================== 记忆管理 =====================

async function refreshMemory() {
  try {
    const data = await bridge.apiGet("memory");
    renderMemory(data);
  } catch (e) {
    $("memoryList").innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

async function queryMemory() {
  const scope = $("mem_scope").value;
  const uid = $("mem_uid").value.trim();
  if (!uid) {
    showToast("请先填写用户ID/群ID", true);
    return;
  }
  try {
    const data = await bridge.apiGet("memory", { scope, uid });
    if (!Array.isArray(data) || data.length === 0) {
      $("memoryList").innerHTML = `<div class="empty">未查询到 ${scope === "group" ? "群" : "用户"} ${escapeHtml(uid)} 的长期记忆</div>`;
      return;
    }
    renderMemory(data);
  } catch (e) {
    $("memoryList").innerHTML = `<div class="empty">查询失败：${escapeHtml(e.message)}</div>`;
  }
}

function renderMemory(data) {
  const list = $("memoryList");
  if (!Array.isArray(data) || data.length === 0) {
    list.innerHTML = '<div class="empty">暂无长期记忆</div>';
    return;
  }
  list.innerHTML = "";
  data.forEach((user) => {
    const isGroup = user.scope === "group";
    const ownerLabel = isGroup
      ? escapeHtml(`群聊 · ${user.uid.replace(/^group_/, "")}`)
      : escapeHtml(`私聊 · ${user.uid.replace(/^user_/, "")}`);
    (user.items || []).forEach((item) => {
      const div = document.createElement("div");
      div.className = "memory-item";
      const timeStr = item.createTime
        ? new Date(item.createTime).toLocaleString()
        : "";
      div.innerHTML = `
          <div class="body">
            <div>${escapeHtml(item.content || "")}</div>
            <div class="uid">${ownerLabel}${timeStr ? " · " + escapeHtml(timeStr) : ""}</div>
          </div>
          <button class="btn danger small del" data-uid="${escapeHtml(user.uid)}" data-id="${escapeHtml(item.id || "")}">删除</button>`;
      list.appendChild(div);
    });
  });
  list.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await confirmDialog("确定删除这条记忆吗？");
      if (!ok) return;
      try {
        await bridge.apiPost("memory/delete", {
          uid: btn.dataset.uid,
          id: btn.dataset.id,
        });
        showToast("✅ 记忆已删除");
        refreshMemory();
        loadStatus();
      } catch (e) {
        showToast("删除失败：" + e.message, true);
      }
    });
  });
}

// ===================== 好感度管理 =====================

async function refreshFavorability() {
  try {
    const scope = $("fav_scope").value;
    const data = await bridge.apiGet("favorability", { scope });
    renderFavorability(data);
  } catch (e) {
    $("favorabilityList").innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

async function queryFavorability() {
  const scope = $("fav_scope").value;
  const uid = $("fav_uid").value.trim();
  if (!uid) {
    showToast("请先填写用户ID/群ID", true);
    return;
  }
  try {
    const data = await bridge.apiGet("favorability", { scope, uid });
    if (!Array.isArray(data) || data.length === 0) {
      $("favorabilityList").innerHTML = `<div class="empty">未查询到 ${scope === "group" ? "群" : "用户"} ${escapeHtml(uid)} 的好感度</div>`;
      return;
    }
    renderFavorability(data);
  } catch (e) {
    $("favorabilityList").innerHTML = `<div class="empty">查询失败：${escapeHtml(e.message)}</div>`;
  }
}

function renderFavorability(data) {
  const list = $("favorabilityList");
  if (!Array.isArray(data) || data.length === 0) {
    list.innerHTML = '<div class="empty">暂无好感度记录</div>';
    return;
  }
  list.innerHTML = "";
  data.forEach((item) => {
    const div = document.createElement("div");
    div.className = "memory-item";
    const scopeLabel = item.scope === "group" ? "群聊" : "私聊";
    const ownerLabel = scopeLabel === "group"
      ? `群 · ${escapeHtml(item.uid)}`
      : `用户 · ${escapeHtml(item.uid)}`;
    div.innerHTML = `
        <div class="body">
          <div>${ownerLabel} · 好感度: ${escapeHtml(item.value)}</div>
          <div class="uid">
            <button class="btn small adjust" data-scope="${escapeHtml(item.scope)}" data-uid="${escapeHtml(item.uid)}" data-value="${escapeHtml(item.value)}">调整</button>
            <button class="btn small danger del" data-scope="${escapeHtml(item.scope)}" data-uid="${escapeHtml(item.uid)}">删除</button>
          </div>
        </div>
      `;
    list.appendChild(div);
  });
  list.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await confirmDialog("确定删除这条好感度记录吗？");
      if (!ok) return;
      try {
        await bridge.apiPost("favorability/delete", {
          scope: btn.dataset.scope,
          uid: btn.dataset.uid,
        });
        showToast("✅ 好感度已删除");
        refreshFavorability();
      } catch (e) {
        showToast("删除失败：" + e.message, true);
      }
    });
  });
  list.querySelectorAll(".adjust").forEach((btn) => {
    btn.addEventListener("click", () => {
      const newValue = prompt(
        "请输入新的好感度值 (0-100):",
        btn.dataset.value
      );
      if (newValue === null) return;
      const num = parseInt(newValue.trim());
      if (isNaN(num) || num < 0 || num > 100) {
        showToast("好感度值必须在 0-100 之间", true);
        return;
      }
      (async () => {
        try {
          await bridge.apiPost("favorability/set", {
            scope: btn.dataset.scope,
            uid: btn.dataset.uid,
            value: num,
          });
          showToast("✅ 好感度已更新");
          refreshFavorability();
        } catch (e) {
          showToast("更新失败：" + e.message, true);
        }
      })();
    });
  });
}

// ===================== 底部菜单栏分页 =====================

function setupBottomNav() {
  const navItems = Array.from(document.querySelectorAll(".nav-item"));
  const views = Array.from(document.querySelectorAll(".view"));
  if (navItems.length === 0 || views.length === 0) return;

  const showView = (name) => {
    views.forEach((v) => v.classList.toggle("active", v.dataset.view === name));
    navItems.forEach((n) => n.classList.toggle("active", n.dataset.view === name));
    const target = views.find((v) => v.dataset.view === name);
    if (target) target.scrollIntoView({ block: "start" });
  };

  navItems.forEach((n) => n.addEventListener("click", () => showView(n.dataset.view)));
}

// ===================== 事件绑定 =====================

async function init() {
  setupBottomNav();
  context = await bridge.ready();
  document.title = bridge.t("pages.dashboard.title", "MiMo_TTS");
  // 优先从后端加载完整音色列表
  try {
    const vRes = await bridge.apiGet("tts_voices");
    if (Array.isArray(vRes && vRes.voices) && vRes.voices.length) {
      ttsVoices = vRes.voices;
    }
  } catch (_) { /* 使用兜底表 */ }
  await Promise.all([loadStatus(), loadPersonas()]);
  try {
    const config = await bridge.apiGet("config");
    applyConfig(config);
    fillSingVoices(config.tts_sing_voice);
  } catch (e) {
    showToast("加载配置失败：" + e.message, true);
  }
  refreshMemory();
}

$("btnTestCustom").addEventListener("click", async () => {
  await testModelStatus("custom", $("btnTestCustom"));
});

$("btnTestAstrbot").addEventListener("click", async () => {
  await testModelStatus("astrbot", $("btnTestAstrbot"));
});

$("custom_model_enable").addEventListener("change", updateCustomModelFields);
$("tts_sing_director_preset").addEventListener("change", syncSingDirectorVisibility);

// 唱歌自定义指令：点击示例模版填入对应指令文本
document.querySelectorAll("[data-sing-template]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.singTemplate;
    const templates = {
      basic: "用温柔、略带气声的方式演唱，副歌部分加强重音，尾音放慢并轻微拉长",
      advanced: "角色：清澈甜美的年轻女声。场景：深夜安静的录音棚。指导：主歌用气声轻轻诉说，副歌胸腔共鸣打开，情绪逐步推高，每句尾音自然收弱。",
      shuqing: "角色：温暖醇厚、略带磁性的嗓音。场景：黄昏的街角，路灯刚亮起。指导：节奏偏慢，每个字都咬实，副歌尾音轻微拉长，整体情绪克制而深情，不刻意煽情。",
      gufeng: "角色：清冷雅致的古韵嗓音，字正腔圆。场景：古曲伴奏，竹林庭院，月色清朗。指导：行腔婉转，咬字归韵，气口留白，旋律在「字」与「腔」之间自然过渡，副歌处共鸣渐开。",
      yaogun: "角色：充满爆发力的摇滚嗓，略带沙哑。场景：现场摇滚演唱会，鼓点密集。指导：主歌紧凑有力，副歌嗓音撕开、咬字加重，节奏快而冲，结尾收得干净利落。",
      minyao: "角色：朴素自然的嗓音，带一点颗粒感。场景：木吉他弹唱，午后阳光。指导：节奏舒缓，像说话一样娓娓道来，副歌稍抬音量，尾音自然轻收，不做作。",
      ertong: "角色：活泼俏皮的童声，干净透亮。场景：儿童合唱团，欢快氛围。指导：节奏明快，咬字清楚圆润，每个字带一点弹性，整体轻快跳跃，不压低嗓音。",
      jiashi: "角色：慵懒松弛的爵士嗓音，气息绵长。场景：深夜爵士酒吧，霓虹灯影。指导：节奏 rub 化，重音位置微微错拍，尾音带一点 swing 的弹性，整体松弛不紧。",
      shuoshuo: "角色：节奏感强的说唱嗓音，咬字干脆。场景：嘻哈节拍，808 鼓组。指导：节奏卡拍，咬字短促有力，韵脚重音，整体律动感强，不拖泥带水。",
    };
    const text = templates[key];
    if (text) $("tts_sing_director").value = text;
  });
});

// 语速和音调滑动条实时显示数值
$("tts_speed").addEventListener("input", (e) => {
  $("tts_speed_value").textContent = parseFloat(e.target.value).toFixed(1);
});

const COMPANION_KEYS = [
  "enable_favorability",
  "favorability_default",
  "enable_private_companion",
  "master_user_ids",
  "avoid_intimate_non_master",
];

const VOICE_KEYS = [
  "tts_enable",
  "tts_mode",
  "tts_api_base_url",
  "tts_api_key",
  "tts_model",
  "tts_voice",
  "tts_speed",
  "tts_emotion",
  "tts_style",
   "tts_rhythm",
   "tts_paralanguage",
     "tts_sing_enable",
     "tts_sing_director",
     "tts_sing_director_preset",
     "tts_sing_inline_tags",
     "tts_sing_format",
     "tts_sing_voice",
 ];

const MEMORY_KEYS = [
  "enable_long_memory",
  "auto_save_memory",
  "memory_recall_count",
];

$("btnSaveCompanion").addEventListener("click", async () => {
  await saveConfigKeys(COMPANION_KEYS, $("btnSaveCompanion"));
});

$("btnSaveVoice").addEventListener("click", async () => {
  await saveConfigKeys(VOICE_KEYS, $("btnSaveVoice"));
});



$("btnSaveIdentity").addEventListener("click", async () => {
  await saveConfigKeys(
    ["persona", "hide_ai_identity", "use_astrbot_default_persona", "astrbot_persona"],
    $("btnSaveIdentity")
  );
});

$("btnSaveMemory").addEventListener("click", async () => {
  await saveConfigKeys(MEMORY_KEYS, $("btnSaveMemory"));
});

const MODEL_KEYS = [
  "chat_model_enable",
  "custom_model_enable",
  "vision_model_enable",
  "api_base_url",
  "api_key",
  "chat_model",
  "vision_model",
];

$("btnSaveModel").addEventListener("click", async () => {
  await saveConfigKeys(MODEL_KEYS, $("btnSaveModel"));
});

const LONGMEM_KEYS = ["enable_long_memory", "auto_save_memory"];

$("btnSaveLongMem").addEventListener("click", async () => {
  await saveConfigKeys(LONGMEM_KEYS, $("btnSaveLongMem"));
});

$("btnSelectPersona").addEventListener("click", async () => {
  const id = $("persona").value;
  if (!id) return;
  try {
    await bridge.apiPost("personas/select", { id });
    showToast("✅ 已切换当前人格");
    renderPersonas(id);
    loadStatus();
    const p = personas.find((x) => x.id === id);
    updateCurrentPersonaName(p ? p.name : "-");
  } catch (e) {
    showToast("切换失败：" + e.message, true);
  }
});

$("btnNewPersona").addEventListener("click", () => openPersonaForm());

$("btnSavePersonaConfig").addEventListener("click", async () => {
  await saveConfigKeys(
    ["persona", "hide_ai_identity", "use_astrbot_default_persona", "astrbot_persona"],
    $("btnSavePersonaConfig")
  );
  await loadPersonas();
  if ($("use_astrbot_default_persona").checked) {
    updateCurrentPersonaName($("astrbot_persona").value || astrbotCurrentPersonaName || "跟随AstrBot配置（当前人格）");
  } else {
    const p = personas.find((x) => x.id === $("persona").value);
    updateCurrentPersonaName(p ? p.name : "-");
  }
});

$("persona").addEventListener("change", () => {
  const p = personas.find((x) => x.id === $("persona").value);
  if (!$("use_astrbot_default_persona").checked) updateCurrentPersonaName(p ? p.name : "-");
});
$("astrbot_persona").addEventListener("change", () => {
  if ($("use_astrbot_default_persona").checked) {
    updateCurrentPersonaName($("astrbot_persona").value || astrbotCurrentPersonaName || "跟随AstrBot配置（当前人格）");
  }
});
$("use_astrbot_default_persona").addEventListener("change", () => {
  syncPersonaSelectionDisabled();
  if ($("use_astrbot_default_persona").checked) {
    updateCurrentPersonaName($("astrbot_persona").value || astrbotCurrentPersonaName || "跟随AstrBot配置（当前人格）");
  } else {
    const p = personas.find((x) => x.id === $("persona").value);
    updateCurrentPersonaName(p ? p.name : "-");
  }
});

$("btnCancelPersona").addEventListener("click", closePersonaForm);

$("btnSavePersona").addEventListener("click", async () => {
  const name = $("pf_name").value.trim();
  const description = $("pf_desc").value.trim();
  const prompt = $("pf_prompt").value.trim();
  if (!name || !prompt) {
    showToast("人格名字与设定 Prompt 不能为空", true);
    return;
  }
  try {
    if (editingPersonaId) {
      await bridge.apiPost("personas/update", {
        id: editingPersonaId,
        name,
        description,
        prompt,
      });
      showToast("✅ 人格已更新");
    } else {
      await bridge.apiPost("personas/add", { name, description, prompt });
      showToast("✅ 人格已新增");
    }
    closePersonaForm();
    await Promise.all([loadPersonas(), loadStatus()]);
  } catch (e) {
    showToast("保存人格失败：" + e.message, true);
  }
});

$("btnRefreshMemory").addEventListener("click", async () => {
  await refreshMemory();
  showToast("✅ 记忆列表已刷新");
});

$("btnQueryMemory").addEventListener("click", queryMemory);
$("mem_uid").addEventListener("keydown", (e) => {
  if (e.key === "Enter") queryMemory();
});

$("btnClearMemory").addEventListener("click", async () => {
  const ok = await confirmDialog("确定清空全部长期记忆吗？此操作不可恢复。");
  if (!ok) return;
  try {
    await bridge.apiPost("memory/clear", {});
    showToast("✅ 已清空全部长期记忆");
    refreshMemory();
    loadStatus();
  } catch (e) {
    showToast("清空失败：" + e.message, true);
  }
});

init();

init();
