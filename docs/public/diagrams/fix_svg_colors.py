#!/usr/bin/env python3
"""
SVG 色值替换脚本 — 把 draw.io 导出的硬编码色值替换为 CSS 变量
用法: python3 fix_svg_colors.py <svg文件或目录>

draw.io 导出的 SVG 会使用固定色值，此脚本按语义映射为 --diagram-* 变量。
"""

import re
import sys
import os

# ============================================================
# 色值映射表 — 按语义分组
# draw.io 默认色值 → CSS 变量
# 你可以根据实际导出的色值增删此表
# ============================================================
COLOR_MAP = {
    # 蓝色系（主流程/核心组件）
    '#dae8fc': 'var(--diagram-accent-bg-1)',      # 浅蓝背景
    '#d5e8d4': 'var(--diagram-accent-bg-2)',      # 浅绿背景
    '#e1d5e7': 'var(--diagram-accent-bg-3)',      # 浅紫背景
    '#fff2cc': 'var(--diagram-accent-bg-4)',      # 浅黄背景
    '#f8cecc': 'var(--diagram-accent-bg-5)',      # 浅红背景
    '#6c8ebf': 'var(--diagram-accent-1)',         # 蓝色边框
    '#82b366': 'var(--diagram-accent-2)',         # 绿色边框
    '#9673a6': 'var(--diagram-accent-3)',         # 紫色边框
    '#d6b656': 'var(--diagram-accent-4)',         # 橙色边框
    '#b85450': 'var(--diagram-accent-5)',         # 红色边框
    '#0d47a1': 'var(--diagram-accent-text-1)',    # 深蓝文字
    '#1b5e20': 'var(--diagram-accent-text-2)',    # 深绿文字
    '#4a148c': 'var(--diagram-accent-text-3)',    # 深紫文字
    '#bf360c': 'var(--diagram-accent-text-4)',    # 深橙文字
    '#b71c1c': 'var(--diagram-accent-text-5)',    # 深红文字
    '#1565c0': 'var(--diagram-accent-1)',         # 蓝色描边
    '#2e7d32': 'var(--diagram-accent-2)',         # 绿色描边
    '#7b1fa2': 'var(--diagram-accent-3)',         # 紫色描边
    '#e65100': 'var(--diagram-accent-4)',         # 橙色描边
    '#c62828': 'var(--diagram-accent-5)',         # 红色描边
    # 灰色系
    '#f5f5f5': 'var(--diagram-surface-2)',
    '#e0e0e0': 'var(--diagram-stroke-2)',
    '#bdbdbd': 'var(--diagram-stroke-1)',
    '#9e9e9e': 'var(--diagram-ghost)',
    '#666666': 'var(--diagram-text-2)',
    '#333333': 'var(--diagram-text-1)',
    '#000000': 'var(--diagram-text-1)',
    '#ffffff': 'var(--diagram-surface-1)',
    '#fff': 'var(--diagram-surface-1)',
}

# 透明背景不替换
SKIP_COLORS = {'none', 'transparent', ''}


def fix_svg(filepath):
    with open(filepath) as f:
        content = f.read()

    original = content

    # 替换 fill="xxx" 和 stroke="xxx"
    def replace_color_attr(m):
        attr = m.group(1)  # fill 或 stroke
        color = m.group(2).strip().lower()
        if color in SKIP_COLORS:
            return m.group(0)
        # 精确匹配
        if color in COLOR_MAP:
            return f'{attr}="{COLOR_MAP[color]}"'
        # 模糊匹配：去掉透明度后缀（如 #fff3 → #fff）
        base = re.sub(r'([0-9a-f]{6})[0-9a-f]{2}$', r'\1', color)
        if base in COLOR_MAP:
            return f'{attr}="{COLOR_MAP[base]}"'
        return m.group(0)

    content = re.sub(
        r'(fill|stroke)="(#[0-9a-fA-F]{3,8})"',
        replace_color_attr,
        content
    )

    # 替换 stop-color（渐变）
    content = re.sub(
        r'stop-color="(#[0-9a-fA-F]{3,8})"',
        lambda m: f'stop-color="{COLOR_MAP.get(m.group(1).lower(), m.group(1))}"',
        content
    )

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False


def main():
    if len(sys.argv) < 2:
        print('用法: python3 fix_svg_colors.py <svg文件或目录>')
        sys.exit(1)

    target = sys.argv[1]
    if os.path.isfile(target):
        files = [target]
    elif os.path.isdir(target):
        files = [os.path.join(target, f) for f in sorted(os.listdir(target)) if f.endswith('.svg')]
    else:
        print(f'找不到: {target}')
        sys.exit(1)

    fixed = 0
    for f in files:
        if fix_svg(f):
            print(f'✅ {os.path.basename(f)}')
            fixed += 1
        else:
            print(f'⏭️ {os.path.basename(f)}: 无需修改')

    print(f'\n共修复 {fixed}/{len(files)} 个文件')


if __name__ == '__main__':
    main()
