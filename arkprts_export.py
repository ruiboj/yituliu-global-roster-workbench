"""Opt-in ArkPRTS roster exporter for Yostar EN/JP/KR.

DESIGN INTENT
-------------
This helper is intentionally separate from the browser and PowerShell server.
The local web tool never receives an email verification code or Yostar token.
Only a minimized roster JSON is written; inventory, story progress, currency,
friends, mail and authentication material are discarded.

RISK
----
ArkPRTS uses undocumented/private game endpoints. Logging in may invalidate the
current game session, upstream formats may change, and use may be restricted by
the game's terms. This script makes no claim of Yostar authorization. MAA screen
recognition remains the recommended default.
"""

from __future__ import annotations

import asyncio
import getpass
import json
import pathlib
import sys
from typing import Any


def sanitize_character(character: dict[str, Any], forced_id: str | None = None) -> dict[str, Any]:
    """Keep only fields consumed by the local editor; never keep auth/session data."""
    char_id = forced_id or str(character.get("charId") or "")
    skills = []
    for skill in character.get("skills") or []:
        if not isinstance(skill, dict):
            continue
        skills.append(
            {
                "skillId": str(skill.get("skillId") or ""),
                "specializeLevel": int(skill.get("specializeLevel") or 0),
            }
        )

    equips: dict[str, dict[str, Any]] = {}
    raw_equips = character.get("equip") or {}
    if isinstance(raw_equips, dict):
        for equip_id, equip in raw_equips.items():
            if not isinstance(equip, dict):
                continue
            equips[str(equip_id)] = {
                "locked": bool(equip.get("locked", True)),
                "hide": bool(equip.get("hide", False)),
                "level": int(equip.get("level") or 0),
            }

    return {
        "charId": char_id,
        "own": True,
        "level": int(character.get("level") or 0),
        "evolvePhase": int(character.get("evolvePhase") or 0),
        "potentialRank": int(character.get("potentialRank") or 0),
        "mainSkillLvl": int(character.get("mainSkillLvl") or 0),
        "skills": skills,
        "equip": equips,
    }


def sanitize_roster(raw: dict[str, Any], server: str) -> dict[str, Any]:
    user = raw.get("user") or {}
    troop = user.get("troop") or {}
    raw_chars = troop.get("chars") or {}
    characters = raw_chars.values() if isinstance(raw_chars, dict) else raw_chars
    by_id: dict[str, dict[str, Any]] = {}

    for character in characters:
        if not isinstance(character, dict) or not character.get("charId"):
            continue
        clean = sanitize_character(character)
        by_id[clean["charId"]] = clean

        # Amiya class changes are stored under tmpl in syncData. Keeping these
        # variants prevents the editor from silently losing their skill state.
        templates = character.get("tmpl") or {}
        if isinstance(templates, dict):
            for template_id, template in templates.items():
                if not isinstance(template, dict) or not str(template_id).startswith("char_"):
                    continue
                merged = dict(character)
                merged.update(template)
                variant = sanitize_character(merged, str(template_id))
                by_id[variant["charId"]] = variant

    status = user.get("status") or {}
    return {
        "format": "arkprts-roster-sanitized",
        "version": 1,
        "source": "ArkPRTS Client.get_raw_data / account/syncData",
        "server": server,
        "profile": {
            "uid": str(status.get("uid") or ""),
            "nickName": str(status.get("nickName") or ""),
            "channelName": {"en": "国际服 EN", "jp": "日服 JP", "kr": "韩服 KR"}[server],
            "channelMasterId": 0,
        },
        "operators": list(by_id.values()),
        "privacy": "Only roster progression is retained; credentials and unrelated account data are discarded.",
    }


async def export() -> None:
    try:
        import arkprts  # type: ignore
    except ImportError as error:
        raise RuntimeError("未安装 ArkPRTS / ArkPRTS is not installed. Run: py -m pip install -U arkprts") from error

    print("风险 / RISK: ArkPRTS 使用 Yostar 私有游戏接口，不是官方第三方 API。")
    print("ArkPRTS uses unofficial private Yostar endpoints, not an official third-party API.")
    print("登录可能使当前游戏会话掉线；接口、账号政策和服务条款可能变化。")
    print("Login may invalidate the current game session; endpoints, account policy, and terms may change.")
    if input("理解并仍要继续，请输入 YES / Type YES only if you accept the risk: ").strip() != "YES":
        print("已取消，未连接任何账号服务 / Cancelled before connecting to account services.")
        return

    server = input("区服 en / jp / kr [en]：").strip().lower() or "en"
    if server not in {"en", "jp", "kr"}:
        raise ValueError("仅支持 en、jp、kr / Only en, jp, and kr are supported.")
    email = input("Yostar 绑定邮箱：").strip()
    if not email or "@" not in email:
        raise ValueError("邮箱格式无效 / Invalid email address.")

    auth = arkprts.YostarAuth(server)
    print("正在请求邮箱验证码…")
    await auth.send_email_code(email)
    code = getpass.getpass("邮箱验证码（输入不会显示）：").strip()
    if not code:
        raise ValueError("验证码不能为空 / Verification code cannot be empty.")

    # Do not call login_with_email_code(stdin=True): that convenience method
    # prints the long-lived Yostar UID/token to the terminal by design.
    yostar_uid, yostar_token = await auth.get_token_from_email_code(email, code, stdin=False)
    await auth.login_with_token(yostar_uid, yostar_token)
    # Minimize accidental lifetime in local variables. The authenticated auth
    # object still needs session state, but the plain-text values are no longer
    # referenced by this exporter and are never written to disk or stdout.
    del yostar_uid, yostar_token
    client = arkprts.Client(auth=auth, assets=False)
    raw = await client.get_raw_data()
    clean = sanitize_roster(raw, server)

    output = pathlib.Path(__file__).with_name("ArkPRTS_OperBox_Export.json")
    output.write_text(json.dumps(clean, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已导出 {len(clean['operators'])} 条干员数据：{output}")
    print("文件不含验证码、Yostar Token 或游戏会话密钥；导入后仍请运行完整检查。")
    print("The file contains no verification code, Yostar token, or session key. Run the full check after importing.")


def main() -> int:
    try:
        asyncio.run(export())
        return 0
    except Exception as error:  # concise user-facing error; never dump locals/tokens
        print(f"导出失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
