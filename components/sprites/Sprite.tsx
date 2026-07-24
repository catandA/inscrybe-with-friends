import { Spritesheet } from '@/lib/spritesheets';

export interface SpriteProps {
    sheet: Spritesheet;
    name: string;
    className?: string;
}
export function Sprite({ className, sheet, name }: SpriteProps) {
    const sprite = sheet.sprites[name];
    // 缺失精灵时降级为「占位符」视觉并告警，避免整个页面崩溃。
    // 常见触发场景：新符文/卡牌已定义但精灵表索引未补（如 thick、starvationStrike）。
    // 占位符使用固定小尺寸（不依赖 tileSize，避免 portraits 的 [41,28]em 撑满屏幕），
    // 并通过 maxWidth/maxHeight: 100% 适配被父容器约束的场景。
    if (!sprite) {
        if (typeof console !== 'undefined') {
            console.warn(`Sprite "${name}" not found in sheet ${sheet.path}`);
        }
        return <div className={className} style={{
            width: '4em',
            height: '4em',
            maxWidth: '100%',
            maxHeight: '100%',
            boxSizing: 'border-box',
            border: '0.4em dashed #f0f',
            backgroundColor: '#0a0a0a',
            color: '#f0f',
            fontWeight: 'bold',
            fontSize: '2em',
            lineHeight: '3.2em',
            textAlign: 'center',
            imageRendering: 'pixelated',
            flexShrink: 0,
        }} title={`Missing sprite: ${name}`}>?</div>;
    }

    let [x, y] = sprite;
    const [sheetWidth, sheetHeight] = sheet.size;
    const [tileWidth, tileHeight] = sprite.length === 4 ? sprite.slice(2, 4) : sheet.tiled?.tileSize ?? [1, 1];
    if (sheet.tiled && sprite.length === 2) {
        x = sheet.tiled.borderWidth.out + x * (sheet.tiled.tileSize[0] + sheet.tiled.borderWidth.in);
        y = sheet.tiled.borderWidth.out + y * (sheet.tiled.tileSize[1] + sheet.tiled.borderWidth.in);
    }

    return <div className={className} style={{
        backgroundImage: `url(${sheet.path})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${sheetWidth}em ${sheetHeight}em`,
        backgroundPosition: `-${x}em -${y}em`,
        imageRendering: 'pixelated',
        width: `${tileWidth}em`,
        height: `${tileHeight}em`,
    }}/>;
}
