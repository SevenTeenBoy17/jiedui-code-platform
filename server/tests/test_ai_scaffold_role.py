"""决策1·方案A（guidance-fading）语义钉死：档位段只作用于 navigator。

法源：外部调研 R2 §3.1 + Hsu(2026) SFM —— 渐退作用于教学型指导（领航员的提示细节量），
驾驶员的分析型能力全程满能力。把驾驶员一起渐退 = 渐退操纵混入第二条作用通道，归因即废。
同时钉死：方案A **不放宽任何安全约束**（BASE_RULE 红线在所有角色×档位组合下在场）。
"""
import pytest

from app import ai


@pytest.mark.parametrize("lv", [0, 1, 2, 3])
def test_driver_never_gets_scaffold_segment(lv):
    """驾驶员在任意档位都不吃档位段：渐退不没收学生的结对同伴。"""
    sys = ai._system("turtle", lv, None, socratic=False)
    for seg in ai.SCAFFOLD.values():
        assert seg not in sys, f"driver 的 system 里出现了档位段（lv={lv}）"
    assert ai.ROLE_PROMPT["turtle"] in sys


@pytest.mark.parametrize("lv", [0, 1, 2, 3])
def test_navigator_gets_exactly_its_level(lv):
    """领航员吃且只吃当前档位的那一段。"""
    sys = ai._system("reviewer", lv, None, socratic=False)
    assert ai.SCAFFOLD[lv] in sys
    for other, seg in ai.SCAFFOLD.items():
        if other != lv:
            assert seg not in sys


def test_socratic_turtle_counts_as_navigator():
    """被强制苏格拉底的 turtle 顶成领航员：吃档位段 + SOCRATIC_OVERRIDE，
    角色契约换成 reviewer（既有语义，方案A 不动它）。"""
    sys = ai._system("turtle", 2, None, socratic=True)
    assert ai.SCAFFOLD[2] in sys and ai.SOCRATIC_OVERRIDE in sys
    assert ai.ROLE_PROMPT["reviewer"] in sys and ai.ROLE_PROMPT["turtle"] not in sys


@pytest.mark.parametrize("role,socratic", [("turtle", False), ("turtle", True),
                                           ("reviewer", False), ("reviewer", True)])
@pytest.mark.parametrize("lv", [0, 3])
def test_base_rule_red_line_in_every_combination(role, socratic, lv):
    """方案A 不放宽红线：全部角色×苏格拉底×档位组合里 BASE_RULE 原样在场。"""
    assert ai.BASE_RULE in ai._system(role, lv, None, socratic=socratic)


def test_prompt_version_bumped_to_v2():
    """提示词拼装语义变了，版本必须升位（定稿 §B7）：v1/v2 的四分类占比分开报。"""
    assert ai.PROMPT_VERSION == "ai-prompt/v2"


def test_is_navigator_predicate_single_source():
    assert ai._is_navigator("reviewer", False) and ai._is_navigator("turtle", True)
    assert not ai._is_navigator("turtle", False)
