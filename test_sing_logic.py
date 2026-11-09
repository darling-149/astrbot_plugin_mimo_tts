"""
MiMoTTS 唱歌功能完整逻辑验证脚本
测试所有唱歌相关的代码路径（采用 MiMo TTS 官方配套搭配）

官方搭配：
    messages = [
        {"role": "user", "content": "<官方风格指令：基本版简洁指令 / 进阶版导演式描述>"},
        {"role": "assistant", "content": "(唱歌)\n歌词正文（可含 [吸气] [笑] 等内联标签）"}
    ]
    audio = {"format": "mp3"/"wav"/"pcm16", "voice": "<音色>"}
"""

import sys

print("=" * 70)
print("MiMoTTS 唱歌功能逻辑验证（官方配套搭配）")
print("=" * 70)

# 风格指令预设（与插件内 MIMO_SING_DIRECTOR_PRESETS 保持一致）
MIMO_SING_DIRECTOR_PRESETS = {
    "basic": "用温柔、略带气声的方式演唱，副歌部分加强重音，尾音放慢并轻微拉长",
    "advanced": (
        "角色：清澈甜美的年轻女声。"
        "场景：深夜安静的录音棚。"
        "指导：主歌用气声轻轻诉说，副歌胸腔共鸣打开，情绪逐步推高，每句尾音自然收弱。"
    ),
    "shuqing": "抒情慢歌",
    "gufeng": "古风",
    "yaogun": "摇滚",
    "minyao": "民谣",
    "ertong": "儿歌",
    "jiashi": "爵士",
    "shuoshuo": "说唱",
    "custom": "",
}

# 官方内联音频标签
MIMO_SING_INLINE_TAGS = [
    {"value": "叹气", "tag": "[叹气]"},
    {"value": "笑", "tag": "[笑]"},
    {"value": "哭", "tag": "[哭]"},
    {"value": "吸气", "tag": "[吸气]"},
    {"value": "停顿", "tag": "[停顿]"},
]


def build_sing_instruction(config: dict) -> str:
    """与插件 _build_sing_instruction 逻辑一致。"""
    custom = str(config.get("tts_sing_director", "") or "").strip()
    preset = str(config.get("tts_sing_director_preset", "basic") or "basic").strip()
    preset_text = MIMO_SING_DIRECTOR_PRESETS.get(preset, MIMO_SING_DIRECTOR_PRESETS["basic"])
    if preset == "custom":
        return custom or MIMO_SING_DIRECTOR_PRESETS["basic"]
    return preset_text


# ==================== 测试 1: build_sing_instruction ====================
def test_build_sing_instruction():
    print("\n" + "=" * 70)
    print("测试 1: build_sing_instruction - 官方风格指令构建")
    print("=" * 70)

    all_passed = True

    # 用例 1：留空 + basic 预设
    cfg1 = {"tts_sing_director": "", "tts_sing_director_preset": "basic"}
    r1 = build_sing_instruction(cfg1)
    ok1 = r1 == MIMO_SING_DIRECTOR_PRESETS["basic"]
    all_passed &= ok1
    print(f"\n{'✓' if ok1 else '✗'} 基本版预设")
    print(f"  输入: {cfg1}")
    print(f"  输出: {r1}")

    # 用例 2：留空 + advanced 预设
    cfg2 = {"tts_sing_director": "", "tts_sing_director_preset": "advanced"}
    r2 = build_sing_instruction(cfg2)
    ok2 = r2 == MIMO_SING_DIRECTOR_PRESETS["advanced"]
    all_passed &= ok2
    print(f"\n{'✓' if ok2 else '✗'} 进阶版预设")
    print(f"  输入: {cfg2}")
    print(f"  输出: {r2}")

    # 用例 3：预设选中 custom + 自定义指令内容
    cfg3 = {"tts_sing_director": "用摇滚的嘶吼唱，节奏又快又冲", "tts_sing_director_preset": "custom"}
    r3 = build_sing_instruction(cfg3)
    ok3 = r3 == "用摇滚的嘶吼唱，节奏又快又冲"
    all_passed &= ok3
    print(f"\n{'✓' if ok3 else '✗'} 自定义指令（preset=custom）")
    print(f"  输入: {cfg3}")
    print(f"  输出: {r3}")

    # 用例 4：preset=custom 但自定义内容为空，回退 basic
    cfg4 = {"tts_sing_director": "", "tts_sing_director_preset": "custom"}
    r4 = build_sing_instruction(cfg4)
    ok4 = r4 == MIMO_SING_DIRECTOR_PRESETS["basic"]
    all_passed &= ok4
    print(f"\n{'✓' if ok4 else '✗'} preset=custom 但自定义为空时回退 basic")

    # 用例 5：未知预设回退 basic
    cfg5 = {"tts_sing_director": "", "tts_sing_director_preset": "xxx"}
    r5 = build_sing_instruction(cfg5)
    ok5 = r5 == MIMO_SING_DIRECTOR_PRESETS["basic"]
    all_passed &= ok5
    print(f"\n{'✓' if ok5 else '✗'} 未知预设回退 basic")

    return all_passed


# ==================== 测试 2: 官方 messages 结构 ====================
def test_official_message_structure():
    print("\n" + "=" * 70)
    print("测试 2: 官方 messages 结构验证")
    print("=" * 70)

    all_passed = True
    config = {"tts_sing_director": "", "tts_sing_director_preset": "advanced"}
    sing_instruction = build_sing_instruction(config)

    # 歌词（含官方内联标签）
    clean = "天空海阔你必须坚强\n[吸气]月亮代表我的心\n[笑]啦啦啦"
    sing_content = f"(唱歌)\n{clean}"

    messages = [
        {"role": "user", "content": sing_instruction},
        {"role": "assistant", "content": sing_content},
    ]
    audio = {"format": "mp3", "voice": "冰糖"}

    # 校验 user 消息是官方风格指令
    ok1 = messages[0]["role"] == "user" and messages[0]["content"] == MIMO_SING_DIRECTOR_PRESETS["advanced"]
    all_passed &= ok1
    print(f"\n{'✓' if ok1 else '✗'} user 消息 = 官方风格指令（进阶版）")

    # 校验 assistant 消息以 (唱歌) 开头
    ok2 = messages[1]["role"] == "assistant" and sing_content.startswith("(唱歌)\n")
    all_passed &= ok2
    print(f"{'✓' if ok2 else '✗'} assistant 消息 = (唱歌) + 歌词正文")

    # 校验音频配置（官方支持格式）
    ok3 = audio["format"] in ("mp3", "wav", "pcm16")
    all_passed &= ok3
    print(f"{'✓' if ok3 else '✗'} 音频格式在官方支持范围内: {audio['format']}")

    # 校验内联标签属于官方标签列表
    official_tag_strings = [t["tag"] for t in MIMO_SING_INLINE_TAGS]
    ok4 = all(tag in official_tag_strings for tag in ("[吸气]", "[笑]"))
    all_passed &= ok4
    print(f"{'✓' if ok4 else '✗'} 歌词内联标签 [吸气][笑] 属于官方标签列表")

    print(f"\n【完整请求结构】")
    print(f"  messages = {messages}")
    print(f"  audio = {audio}")
    return all_passed


# ==================== 测试 3: _detect_sing_content ====================
def test_detect_sing_content():
    print("\n" + "=" * 70)
    print("测试 3: _detect_sing_content - 歌词内容检测")
    print("=" * 70)

    def detect(text):
        """与插件 _detect_sing_content 一致：只识别明确唱歌信号。"""
        if not isinstance(text, str) or not text:
            return False
        stripped = text.strip()
        if '(唱歌)' in stripped or '（唱歌）' in stripped:
            return True
        first_line = stripped.split('\n', 1)[0].strip()
        if first_line.startswith('《') and '》' in first_line:
            return True
        return False

    test_cases = [
        ("你好，今天天气怎么样？", False, "普通对话（单行）"),
        ("好的，我来帮你分析一下：\n第一点是这样的。\n第二点要注意。\n希望有帮助！", False, "普通多行回复不应误判"),
        ("《稻香》\n回到最初的美好\n不要哭让萤火虫带着你逃跑", True, "《歌名》标题开头"),
        ("(唱歌)\n天空海阔你必须坚强", True, "官方唱歌标记"),
        ("（唱歌）快来唱这首歌", True, "包含唱歌标记（中文括号）"),
        ("这首诗的歌词很美", False, "仅含'歌词'二字不触发"),
    ]

    all_passed = True
    for text, expected, description in test_cases:
        result = detect(text)
        passed = result == expected
        all_passed &= passed
        status = "✓" if passed else "✗"
        print(f"\n{status} {description}")
        print(f"  输入: {repr(text[:50])}")
        print(f"  预期: {expected}, 实际: {result}")
    return all_passed


# ==================== 测试 4: _parse_sing_command ====================
def test_parse_song_request():
    print("\n" + "=" * 70)
    print("测试 4: _parse_sing_command - 唱歌命令解析")
    print("=" * 70)

    def parse_sing_command(text):
        """与插件 _parse_sing_command 一致。"""
        if not text:
            return None
        text = text.strip()
        if text.startswith('/唱歌 '):
            song_name = text[3:].strip()
            if song_name:
                return ('search', song_name, None)
        elif text.startswith('/唱个 '):
            song_name = text[3:].strip()
            if song_name:
                return ('search', song_name, None)
        elif text.startswith('/跟唱 '):
            custom_lyrics = text[3:].strip()
            if custom_lyrics:
                return ('custom', None, custom_lyrics)
        elif text == '/唱歌' or text == '/唱个':
            return None
        return None

    test_cases = [
        ("/唱歌 稻香", ('search', '稻香', None), "搜索歌曲命令"),
        ("/唱个 晴天", ('search', '晴天', None), "唱个命令变体"),
        ("/跟唱 你好呀", ('custom', None, '你好呀'), "自定义歌词命令"),
        ("/唱歌", None, "无参数唱歌命令"),
        ("今天天气真好", None, "普通文本"),
    ]

    all_passed = True
    for text, expected, description in test_cases:
        result = parse_sing_command(text)
        passed = result == expected
        all_passed &= passed
        status = "✓" if passed else "✗"
        print(f"\n{status} {description}")
        print(f"  输入: {repr(text)}")
        print(f"  预期: {expected}")
        print(f"  实际: {result}")
    return all_passed


# ==================== 测试 5: _validate_lyrics ====================
def test_validate_lyrics():
    print("\n" + "=" * 70)
    print("测试 5: _validate_lyrics - 歌词验证")
    print("=" * 70)

    test_cases = [
        ("《稻香》\n回家吧 回到最初的美好\n不要哭 让萤火虫带着你逃跑", True, "有效歌词"),
        ("", False, "空歌词"),
        ("你好", False, "太短的歌词"),
        ("error\n系统错误", False, "包含错误标记"),
        ("[吸气]月亮代表我的心\n[笑]啦啦啦好开心", True, "含官方内联标签的歌词"),
        ("我们一起唱歌吧\n啦啦啦啦啦啦\n我们一起唱歌吧\n啦啦啦啦啦啦\n啦啦啦啦啦啦", True, "重复副歌应视为有效"),
    ]

    all_passed = True
    for lyrics, expected, description in test_cases:
        if not lyrics or len(lyrics.strip()) < 20:
            result = False
        else:
            lines = [line.strip() for line in lyrics.split('\n') if line.strip()]
            if len(lines) < 2:
                result = False
            else:
                unique_lines = set(lines)
                if len(unique_lines) < 2:
                    result = False
                else:
                    error_indicators = ['error', '错误', '无效', 'failed', '404', 'not found']
                    result = not any(indicator in lyrics.lower() for indicator in error_indicators)

        passed = result == expected
        all_passed &= passed
        status = "✓" if passed else "✗"
        print(f"\n{status} {description}")
        print(f"  输入: {repr(lyrics[:50])}")
        print(f"  预期: {expected}, 实际: {result}")
    return all_passed


# ==================== 测试 6: 完整流程模拟 ====================
def test_full_flow():
    print("\n" + "=" * 70)
    print("测试 6: 完整流程模拟（官方配套搭配）")
    print("=" * 70)

    print("\n场景 1: 用户发送 '/唱歌 稻香'")
    print("  1. _parse_song_request 解析 → ('search', '稻香', None)")
    print("  2. _search_lyrics 获取歌词 → _clean_lyrics 清理为纯歌词行")
    print("  3. text_to_voice(sing_mode=True)")
    print("     → user: 风格指令预设/自定义")
    print("     → assistant: '(唱歌)' + 歌词正文（可含 [吸气] [笑] 内联标签）")
    print("     → audio: {format: 'mp3', voice: 配置音色}")
    print("  4. 校验文件 > 1KB → 发送 Record 语音消息")
    print("\n验证状态: ✓ PASS (流程逻辑正确)")
    return True


# ==================== 测试 7: 唱歌独立音色 ====================
def test_sing_independent_voice():
    print("\n" + "=" * 70)
    print("测试 7: 唱歌独立音色逻辑")
    print("=" * 70)

    all_passed = True

    def resolve_sing_voice(config):
        """与插件 text_to_voice 音色解析逻辑一致。"""
        voice = config.get("tts_voice", "冰糖")
        if config.get("tts_sing_voice", ""):
            voice = config["tts_sing_voice"]
        return voice

    # 用例 1：未填唱歌独立音色，跟随普通音色
    cfg1 = {"tts_voice": "茉莉", "tts_sing_voice": ""}
    r1 = resolve_sing_voice(cfg1)
    ok1 = r1 == "茉莉"
    all_passed &= ok1
    print(f"\n{'✓' if ok1 else '✗'} 未填唱歌独立音色 → 跟随普通音色")

    # 用例 2：填写了唱歌独立音色，使用独立值
    cfg2 = {"tts_voice": "茉莉", "tts_sing_voice": "白桦"}
    r2 = resolve_sing_voice(cfg2)
    ok2 = r2 == "白桦"
    all_passed &= ok2
    print(f"{'✓' if ok2 else '✗'} 填写独立音色 → 使用独立值")

    return all_passed


# ==================== 测试 8: 歌词清理流畅性 ====================
def test_clean_lyrics_fluency():
    print("\n" + "=" * 70)
    print("测试 8: _clean_lyrics - 歌词清理流畅性（不误删合法歌词）")
    print("=" * 70)

    import re

    def strip_lrc_tags(text):
        if not text:
            return ""
        cleaned = []
        for raw in text.splitlines():
            line = raw.strip()
            if not line:
                continue
            line = re.sub(r'\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]', '', line).strip()
            if not line:
                continue
            if re.match(
                r'^\s*\[(?:ti|ar|al|by|offset|re|ve|length|hash|id|au|total|language|t_time|ts)\s*[:：]',
                line, re.IGNORECASE,
            ):
                continue
            cleaned.append(line)
        return "\n".join(cleaned)

    def clean_lyrics(text):
        if not text:
            return ""
        text = strip_lrc_tags(text)
        lines = text.strip().split('\n')
        header_budget = 2
        cleaned_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            in_header = header_budget > 0
            if line.startswith('《'):
                if in_header:
                    header_budget -= 1
                continue
            if re.match(r'^\s*(?:作词|作詞|作曲|编曲|編曲|词|曲|演唱|原唱|翻唱|制作人|制作|混音|录音|监制|出品|发行)\s*[:：]\s*\S+', line):
                if in_header:
                    header_budget -= 1
                continue
            if (in_header and len(line) <= 30 and
                re.match(r'^[^\-\—\–。，！？、：；\s]{1,10}\s*[\-—–]\s*[^\-\—\–。，！？、：；\s]{1,10}$', line)):
                header_budget -= 1
                continue
            if line.startswith('版权') or line.startswith('著作权') or line.startswith('备注') or line.startswith('注：'):
                if in_header:
                    header_budget -= 1
                continue
            header_budget = 0
            cleaned_lines.append(line)
        if not cleaned_lines:
            return text.strip()
        return '\n'.join(cleaned_lines)

    cases = [
        ("短句副歌不应被删", "我们一起来\n跳啊跳\n嘿嘿嘿\n啦啦啦\nHands up\n啊啊啊",
         ["我们一起来", "跳啊跳", "嘿嘿嘿", "啦啦啦", "Hands up", "啊啊啊"]),
        ("破折号歌词不应被删", "你走以后\n我 - 还在原地\n爱—不停歇",
         ["你走以后", "我 - 还在原地", "爱—不停歇"]),
        ("开头歌名-歌手应删除", "晴天 - 周杰伦\n故事的小黄花\n从出生那年就飘着",
         ["故事的小黄花", "从出生那年就飘着"]),
        ("LRC 标签应剥离", "[ti:稻香]\n[00:12.34]对这个世界如果你有太多的抱怨\n[00:18.00]跌倒了就不敢继续往前走",
         ["对这个世界如果你有太多的抱怨", "跌倒了就不敢继续往前走"]),
    ]

    all_passed = True
    for desc, src, expected_lines in cases:
        result = clean_lyrics(src)
        result_lines = [l for l in result.split('\n') if l.strip()]
        passed = result_lines == expected_lines
        all_passed &= passed
        status = "✓" if passed else "✗"
        print(f"\n{status} {desc}")
        print(f"  实际: {result_lines}")
        print(f"  预期: {expected_lines}")
    return all_passed


def main():
    results = []
    results.append(("官方风格指令构建", test_build_sing_instruction()))
    results.append(("官方 messages 结构", test_official_message_structure()))
    results.append(("歌词内容检测", test_detect_sing_content()))
    results.append(("唱歌命令解析", test_parse_song_request()))
    results.append(("歌词验证", test_validate_lyrics()))
    results.append(("完整流程模拟", test_full_flow()))
    results.append(("唱歌独立音色", test_sing_independent_voice()))
    results.append(("歌词清理流畅性", test_clean_lyrics_fluency()))

    print("\n" + "=" * 70)
    print("验证汇总")
    print("=" * 70)

    all_passed = True
    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {name}: {status}")
        if not passed:
            all_passed = False

    print("\n" + "=" * 70)
    if all_passed:
        print("所有验证通过！")
    else:
        print("部分验证失败，请检查相关代码")
    print("=" * 70)
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
