import { describe, it, expect } from 'vitest';
import { FileViewerPage, G2_VIEWER_MAX_WIDTH } from '../file-viewer-page';
import type { PageRenderResult } from '../../page-manager';
import type { TextContainerProperty } from '@evenrealities/even_hub_sdk';
import type { FileSystemItem } from '../../../domain/types';

const HEADER_X = 4;
const HEADER_WIDTH = 572;
const CONTENT_RIGHT_EDGE = HEADER_X + HEADER_WIDTH;
const PX_PER_UNIT = HEADER_WIDTH / G2_VIEWER_MAX_WIDTH;
const TOTAL_LINES = 153;

function makePage(): { page: FileViewerPage; internal: Record<string, any> } {
  const file: FileSystemItem = {
    id: 'C:\\hp1\\temp\\aaa.txt',
    name: 'aaa.txt',
    type: 'file',
    path: 'C:\\hp1\\temp\\aaa.txt',
  };
  const page = new FileViewerPage(file, {} as any, async () => true);
  const internal = page as unknown as Record<string, any>;
  internal.lines = Array.from({ length: TOTAL_LINES }, (_, i) => `line ${i}`);
  internal.buildWrappedLines();
  internal.scrollPosition = 0;
  return { page, internal };
}

function byName(result: PageRenderResult, name: string): TextContainerProperty | undefined {
  return result.textObject?.find((c) => c.containerName === name);
}

function contentOf(result: PageRenderResult, name: string): string {
  return byName(result, name)?.content ?? '';
}

function enableAutoScroll(internal: Record<string, any>, seconds: string) {
  internal.autoScrollEnabled = true;
  internal.autoScrollIndicator = seconds;
}

describe('FileViewerPage header (通常時)', () => {
  it('従来通り viewer_header + viewer_body の2コンテナ', () => {
    const { page } = makePage();
    const result = page.render();

    expect(result.containerTotalNum).toBe(2);
    expect(result.textObject?.map((c) => c.containerName)).toEqual([
      'viewer_header',
      'viewer_body',
    ]);
    expect(contentOf(result, 'viewer_header')).toContain('[Viewer]');
    expect(contentOf(result, 'viewer_header')).toContain('C:\\hp1\\temp\\aaa.txt');
    expect(contentOf(result, 'viewer_header')).toContain(`[1-9/${TOTAL_LINES}]k`);
  });

  it('ヘッダー位置は従来通り (4, 2, 572x28)', () => {
    const { page } = makePage();
    const header = byName(page.render(), 'viewer_header')!;

    expect(header.xPosition).toBe(HEADER_X);
    expect(header.yPosition).toBe(2);
    expect(header.width).toBe(HEADER_WIDTH);
    expect(header.height).toBe(28);
  });

  it('isEventCapture は body のみ 1', () => {
    const { page } = makePage();
    const result = page.render();
    const capturing = result.textObject!.filter((c) => c.isEventCapture === 1);

    expect(capturing).toHaveLength(1);
    expect(capturing[0].containerName).toBe('viewer_body');
  });
});

describe('FileViewerPage header (自動スクロール中)', () => {
  it('日時と残り秒を別 TextContainer に分割した3コンテナを返す', () => {
    const { page, internal } = makePage();
    enableAutoScroll(internal, '17');
    const result = page.render();

    expect(result.containerTotalNum).toBe(3);
    expect(result.textObject?.map((c) => c.containerName)).toEqual([
      'viewer_hdr_dt',
      'viewer_hdr_rem',
      'viewer_body',
    ]);
    expect(contentOf(result, 'viewer_hdr_rem')).toBe('@17s');
  });

  it('[Viewer] を表示せず、日時は YYYY/M/D(Day)HH:mm:ss 形式', () => {
    const { page, internal } = makePage();
    enableAutoScroll(internal, '17');
    const result = page.render();
    const allText = result.textObject!.map((c) => c.content).join('\n');

    expect(allText).not.toContain('[Viewer]');
    expect(allText).not.toContain('|');

    const dateTime = contentOf(result, 'viewer_hdr_dt');
    expect(dateTime).toMatch(/^\d{4}\/\d{1,2}\/\d{1,2}\([A-Za-z]{3}\)\d{1,2}:\d{2}:\d{2}$/);
    expect(dateTime).not.toContain('[Viewer]');
  });

  it('日時は通常時ヘッダーと同じ左端・同じ行に配置される', () => {
    const { page, internal } = makePage();
    enableAutoScroll(internal, '17');
    const result = page.render();
    const dateTime = byName(result, 'viewer_hdr_dt')!;

    expect(dateTime.xPosition).toBe(HEADER_X);
    expect(dateTime.yPosition).toBe(2);
    expect(dateTime.height).toBe(28);
  });

  it('残り秒は右端寄りに配置され、画面端で欠けない', () => {
    const { page, internal } = makePage();
    enableAutoScroll(internal, '17');
    const result = page.render();
    const remaining = byName(result, 'viewer_hdr_rem')!;
    const textWidth = page.getStringWidth(remaining.content!) * PX_PER_UNIT;
    const textRight = remaining.xPosition! + textWidth;

    // 右端アンカー (568) に収まり、画面端まで余白を確保する
    expect(textRight).toBeLessThanOrEqual(569);
    expect(textRight).toBeGreaterThanOrEqual(556);
    // コンテナ自体もキャンバス外にはみ出さない
    expect(remaining.xPosition! + remaining.width!).toBeLessThanOrEqual(CONTENT_RIGHT_EDGE);
    // 日時に食い込まない
    const dateTime = byName(result, 'viewer_hdr_dt')!;
    const dateTimeRight =
      dateTime.xPosition! + page.getStringWidth(dateTime.content!) * PX_PER_UNIT;
    expect(remaining.xPosition!).toBeGreaterThan(dateTimeRight);
  });

  it('datetime と remaining のコンテナ矩形が重複しない (gap 8px)', () => {
    const { page, internal } = makePage();

    for (const seconds of ['30', '17', '9', '1']) {
      enableAutoScroll(internal, seconds);
      const result = page.render();
      const dateTime = byName(result, 'viewer_hdr_dt')!;
      const remaining = byName(result, 'viewer_hdr_rem')!;

      const dateTimeRight = dateTime.xPosition! + dateTime.width!;
      expect(dateTimeRight).toBeLessThanOrEqual(remaining.xPosition!);
      expect(remaining.xPosition! - dateTimeRight).toBe(8);
      // datetime のテキストはコンテナ内に収まる
      const textRight = dateTime.xPosition! + page.getStringWidth(dateTime.content!) * PX_PER_UNIT;
      expect(textRight).toBeLessThanOrEqual(dateTimeRight);
      expect(remaining.xPosition! + remaining.width!).toBeLessThanOrEqual(CONTENT_RIGHT_EDGE);
    }
  });

  it('秒数が変わっても右端位置がガタつかない (@30s -> @9s)', () => {
    const { page, internal } = makePage();

    enableAutoScroll(internal, '30');
    const at30 = byName(page.render(), 'viewer_hdr_rem')!;
    enableAutoScroll(internal, '29');
    const at29 = byName(page.render(), 'viewer_hdr_rem')!;
    enableAutoScroll(internal, '9');
    const at9 = byName(page.render(), 'viewer_hdr_rem')!;

    const rightEdge = (c: TextContainerProperty) =>
      c.xPosition! + page.getStringWidth(c.content!) * PX_PER_UNIT;

    // 右端は 1px 未満の誤差に収まる (残り秒の桁が変わってもガタつかない)
    expect(Math.abs(rightEdge(at30) - rightEdge(at29))).toBeLessThan(1);
    expect(Math.abs(rightEdge(at30) - rightEdge(at9))).toBeLessThan(1);
    // 位置指定は整数ピクセル
    expect(Number.isInteger(at30.xPosition)).toBe(true);
    expect(Number.isInteger(at9.xPosition)).toBe(true);
    // 文字数が減っても右端は動かず、左端だけが寄る
    expect(at9.xPosition!).toBeGreaterThan(at30.xPosition!);
  });

  it('本文は通常時と同一で、isEventCapture は body のみ 1', () => {
    const { page, internal } = makePage();
    const normalBody = contentOf(page.render(), 'viewer_body');

    enableAutoScroll(internal, '17');
    const result = page.render();
    const capturing = result.textObject!.filter((c) => c.isEventCapture === 1);

    expect(contentOf(result, 'viewer_body')).toBe(normalBody);
    expect(capturing).toHaveLength(1);
    expect(capturing[0].containerName).toBe('viewer_body');
    expect(byName(result, 'viewer_body')!.containerID).toBe(2);
  });
});

describe('タップによる状態切替', () => {
  it('タップで自動スクロールヘッダー(3コンテナ)になり、再タップで通常ヘッダーへ戻る', async () => {
    const { page, internal } = makePage();

    expect(page.render().containerTotalNum).toBe(2);

    await page.onClick();
    expect(internal.autoScrollEnabled).toBe(true);
    let result = page.render();
    expect(result.containerTotalNum).toBe(3);
    expect(contentOf(result, 'viewer_hdr_dt')).toBeTruthy();
    expect(contentOf(result, 'viewer_hdr_rem')).toMatch(/^@\d+s$/);

    await page.onClick();
    expect(internal.autoScrollEnabled).toBe(false);
    result = page.render();
    expect(result.containerTotalNum).toBe(2);
    expect(contentOf(result, 'viewer_header')).toContain('[Viewer]');
  });
});

describe('ファイル末尾到達による自動停止', () => {
  it('末尾で自動停止すると通常ヘッダーへ戻る', () => {
    const { page, internal } = makePage();
    enableAutoScroll(internal, '1');
    internal.scrollPosition = internal.wrappedLines.length - 9;
    internal.autoScrollRemainingMs = 0;
    internal.autoScrollLastTickTime = Date.now();

    expect(page.render().containerTotalNum).toBe(3);

    page.onAutoTick();

    expect(internal.autoScrollEnabled).toBe(false);
    expect(internal.autoScrollIndicator).toBeNull();
    const result = page.render();
    expect(result.containerTotalNum).toBe(2);
    expect(contentOf(result, 'viewer_header')).toContain('[Viewer]');
  });
});
