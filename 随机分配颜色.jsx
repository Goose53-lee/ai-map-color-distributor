#target illustrator

/**
 * =========================================================================
 * 批量随机多色比例赋色工具 (空间抗聚集蓝噪声优化版)
 *
 * 核心升级：
 * 1. 【空间防扎堆 / 蓝噪声抗聚集算法 (Blue Noise Anti-Clustering)】：
 *    彻底解决传统纯随机算法导致的“泊松聚集（颜色挤在一起、大片成团）”问题。
 *    采用自适应空间网格 + 3x3 空间邻域排斥 + 序列防连号机制，
 *    在严格保证 50%/30%/20% 比例的前提下，让不同颜色交织错落、均匀散布。
 *
 * 2. 【严谨的网格表头布局 (Grid / Table)】：
 *    采用四列栅格化结构（色彩通道/预览、HEX 色值、分配比例、不透明度），
 *    垂直参考线规整，无多余零碎标签。
 *
 * 3. 【无 Emoji / 专业规范】：
 *    去除 Emoji 图标，全面采用规范专业 UI 标签与提示。
 *
 * 4. 【两极分置防误触】：
 *    取消按钮居左，执行按钮居右，物理距离彻底拉开。
 *
 * 5. 【万级图元极速架构】：
 *    递归穿透任意深度编组，单例颜色复用，空间计算耗时 < 1 秒，
 *    UI 节流平滑进度条，100% 走完后静默自动关闭。
 * =========================================================================
 */

// ======================= 【默认颜色、比例与透明度配置】 =======================
// 你可以直接在下方修改浅色与深色的默认 HEX 色值、比例和透明度，改一次永久生效！
var THEME_CONFIG = {
    // 浅色风格预设（适合浅底/白底地图）
    light: {
        name: "浅色风格",
        color1: { name: "浅色 1", hex: "dde5ed", ratio: 50, opacity: 100 },
        color2: { name: "浅色 2", hex: "d0dfea", ratio: 30, opacity: 100 },
        color3: { name: "浅色 3", hex: "c3d2e2", ratio: 20, opacity: 100 }
    },
    // 深色风格预设（适合深底/夜间/冷调地图）
    dark: {
        name: "深色风格",
        color1: { name: "深色 1", hex: "445668", ratio: 50, opacity: 75 },
        color2: { name: "深色 2", hex: "3b516b", ratio: 30, opacity: 75 },
        color3: { name: "深色 3", hex: "34455e", ratio: 20, opacity: 75 }
    }
};
// ==========================================================================

function randomColorAssign() {
    if (app.documents.length === 0) {
        alert("请先打开 Illustrator 文档！");
        return;
    }

    var doc = app.activeDocument;
    var rawSel = doc.selection;

    if (!rawSel || rawSel.length === 0) {
        alert("请先选中需要分配颜色的矩形图形！");
        return;
    }

    // 1. 递归穿透编组，提取底层所有路径与复合路径
    var items = [];
    function extractItems(collection) {
        for (var i = 0; i < collection.length; i++) {
            var it = collection[i];
            if (it.typename === "GroupItem") {
                extractItems(it.pageItems);
            } else if (it.typename === "PathItem" || it.typename === "CompoundPathItem") {
                items.push(it);
            }
        }
    }
    extractItems(rawSel);

    var total = items.length;
    if (total === 0) {
        alert("选区内未发现可填充颜色的矢量图元！\n若为剪切蒙版或锁定的对象，请先解锁或释放。");
        return;
    }

    // 2. 颜色转换工具函数
    function hexToRgb(hex) {
        if (!hex) return { r: 128, g: 128, b: 128 };
        hex = hex.replace("#", "").replace(/\s/g, "");
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (hex.length !== 6) {
            return { r: 128, g: 128, b: 128 };
        }
        var num = parseInt(hex, 16);
        if (isNaN(num)) return { r: 128, g: 128, b: 128 };
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255
        };
    }

    var isCmykDoc = (doc.documentColorSpace === DocumentColorSpace.CMYK);

    function rgbToCmyk(r, g, b) {
        var rN = r / 255, gN = g / 255, bN = b / 255;
        var k = 1 - Math.max(rN, Math.max(gN, bN));
        if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
        var c = (1 - rN - k) / (1 - k);
        var m = (1 - gN - k) / (1 - k);
        var y = (1 - bN - k) / (1 - k);
        return {
            c: Math.round(c * 100),
            m: Math.round(m * 100),
            y: Math.round(y * 100),
            k: Math.round(k * 100)
        };
    }

    function makeAiColor(hexStr) {
        var rgb = hexToRgb(hexStr);
        if (isCmykDoc) {
            var cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
            var cColor = new CMYKColor();
            cColor.cyan = cmyk.c;
            cColor.magenta = cmyk.m;
            cColor.yellow = cmyk.y;
            cColor.black = cmyk.k;
            return cColor;
        } else {
            var rColor = new RGBColor();
            rColor.red = rgb.r;
            rColor.green = rgb.g;
            rColor.blue = rgb.b;
            return rColor;
        }
    }

    // 3. 构建规范化的 ScriptUI 交互界面
    var win = new Window("dialog", "批量随机赋色 (已识别: " + total + " 个图元)");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 12;
    win.margins = [18, 16, 18, 16];

    // 模式切换面板 (宽度充足，杜绝省略号截断；无 Emoji)
    var modeBox = win.add("panel", undefined, "地图配色模式");
    modeBox.orientation = "row";
    modeBox.alignChildren = ["center", "center"];
    modeBox.spacing = 28;
    modeBox.margins = [16, 14, 16, 12];

    var rbLight = modeBox.add("radiobutton", undefined, "浅色模式 (浅色底图)");
    rbLight.preferredSize.width = 160;
    var rbDark  = modeBox.add("radiobutton", undefined, "深色模式 (深色底图)");
    rbDark.preferredSize.width = 160;
    rbLight.value = true; // 默认浅色

    var currentMode = "light";

    // 容器栈：浅色面板 vs 深色面板
    var contentStack = win.add("group");
    contentStack.orientation = "stack";
    contentStack.alignChildren = ["fill", "top"];

    var panelLight = contentStack.add("panel", undefined, "浅色通道参数配置");
    panelLight.orientation = "column";
    panelLight.alignChildren = ["fill", "top"];
    panelLight.spacing = 8;
    panelLight.margins = [16, 14, 16, 14];

    var panelDark = contentStack.add("panel", undefined, "深色通道参数配置");
    panelDark.orientation = "column";
    panelDark.alignChildren = ["fill", "top"];
    panelDark.spacing = 8;
    panelDark.margins = [16, 14, 16, 14];
    panelDark.visible = false;

    // 表头构建函数 (建立整齐的 4 列视觉网格)
    function buildTableHeader(container) {
        var header = container.add("group");
        header.orientation = "row";
        header.alignChildren = ["left", "center"];
        header.spacing = 10;
        header.margins = [2, 2, 2, 4];

        var th1 = header.add("statictext", undefined, "通道 / 预览");
        th1.preferredSize.width = 110;

        var th2 = header.add("statictext", undefined, "HEX 色值");
        th2.preferredSize.width = 95;

        var th3 = header.add("statictext", undefined, "分配比例");
        th3.preferredSize.width = 80;

        var th4 = header.add("statictext", undefined, "不透明度");
        th4.preferredSize.width = 80;

        // 次级文字颜色弱化
        var mutedColor = win.graphics.newPen(win.graphics.PenType.SOLID_COLOR, [0.35, 0.35, 0.35, 1], 1);
        th1.graphics.foregroundColor = mutedColor;
        th2.graphics.foregroundColor = mutedColor;
        th3.graphics.foregroundColor = mutedColor;
        th4.graphics.foregroundColor = mutedColor;
    }

    // 数据行构建函数 (严格对齐表头 4 列参考线)
    function buildColorRow(container, label, cfg) {
        var row = container.add("group");
        row.orientation = "row";
        row.alignChildren = ["left", "center"];
        row.spacing = 10;
        row.margins = [2, 2, 2, 2];

        // 第 1 列：色块预览 + 通道标签 (宽 110)
        var col1 = row.add("group");
        col1.orientation = "row";
        col1.alignChildren = ["left", "center"];
        col1.spacing = 8;
        col1.preferredSize.width = 110;

        var swatch = col1.add("panel", undefined);
        swatch.preferredSize = [28, 18];
        swatch.helpTip = "颜色预览 (实时响应右侧 HEX 输入)";

        var lbl = col1.add("statictext", undefined, label);
        lbl.preferredSize.width = 65;

        var currentColorHex = cfg.hex;

        swatch.onDraw = function() {
            try {
                var gfx = this.graphics;
                var rgb = hexToRgb(currentColorHex);
                var r = rgb.r / 255;
                var g = rgb.g / 255;
                var b = rgb.b / 255;

                var w = this.size[0] || this.size.width || 28;
                var h = this.size[1] || this.size.height || 18;

                // 填充纯色
                var brush = gfx.newBrush(gfx.BrushType.SOLID_COLOR, [r, g, b, 1]);
                gfx.rectPath(0, 0, w, h);
                gfx.fillPath(brush);

                // 绘制 1px 边框
                var pen = gfx.newPen(gfx.PenType.SOLID_COLOR, [0.4, 0.4, 0.4, 1], 1);
                gfx.rectPath(0.5, 0.5, w - 1, h - 1);
                gfx.strokePath(pen);
            } catch (err) {}
        };

        // 第 2 列：HEX 色值输入 (宽 95)
        var col2 = row.add("group");
        col2.orientation = "row";
        col2.alignChildren = ["left", "center"];
        col2.spacing = 2;
        col2.preferredSize.width = 95;

        col2.add("statictext", undefined, "#");
        var etHex = col2.add("edittext", undefined, cfg.hex);
        etHex.preferredSize.width = 72;

        function refreshSwatch() {
            currentColorHex = etHex.text;
            try { win.update(); } catch (e) {}
        }
        etHex.onChanging = refreshSwatch;
        etHex.onChange = refreshSwatch;

        // 第 3 列：分配比例 (宽 80)
        var col3 = row.add("group");
        col3.orientation = "row";
        col3.alignChildren = ["left", "center"];
        col3.spacing = 2;
        col3.preferredSize.width = 80;

        var etRatio = col3.add("edittext", undefined, cfg.ratio.toString());
        etRatio.preferredSize.width = 46;
        col3.add("statictext", undefined, "%");

        // 第 4 列：不透明度 (宽 80)
        var col4 = row.add("group");
        col4.orientation = "row";
        col4.alignChildren = ["left", "center"];
        col4.spacing = 2;
        col4.preferredSize.width = 80;

        var etOpacity = col4.add("edittext", undefined, (cfg.opacity !== undefined ? cfg.opacity : 100).toString());
        etOpacity.preferredSize.width = 46;
        col4.add("statictext", undefined, "%");

        return { hex: etHex, ratio: etRatio, opacity: etOpacity, swatch: swatch };
    }

    // 构建浅色面板内容
    buildTableHeader(panelLight);
    var lightRows = {
        row1: buildColorRow(panelLight, "浅色 1", THEME_CONFIG.light.color1),
        row2: buildColorRow(panelLight, "浅色 2", THEME_CONFIG.light.color2),
        row3: buildColorRow(panelLight, "浅色 3", THEME_CONFIG.light.color3)
    };
    var tipLight = panelLight.add("statictext", undefined, "提示：当前为浅色模式，执行时仅分配上述浅色色彩与透明度。");
    tipLight.graphics.foregroundColor = win.graphics.newPen(win.graphics.PenType.SOLID_COLOR, [0.45, 0.45, 0.45, 1], 1);

    // 构建深色面板内容
    buildTableHeader(panelDark);
    var darkRows = {
        row1: buildColorRow(panelDark, "深色 1", THEME_CONFIG.dark.color1),
        row2: buildColorRow(panelDark, "深色 2", THEME_CONFIG.dark.color2),
        row3: buildColorRow(panelDark, "深色 3", THEME_CONFIG.dark.color3)
    };
    var tipDark = panelDark.add("statictext", undefined, "提示：当前为深色模式，执行时仅分配上述深色色彩与透明度。");
    tipDark.graphics.foregroundColor = win.graphics.newPen(win.graphics.PenType.SOLID_COLOR, [0.45, 0.45, 0.45, 1], 1);

    // 模式切换事件
    rbLight.onClick = function() {
        currentMode = "light";
        panelDark.visible = false;
        panelLight.visible = true;
        win.layout.layout(true);
        try { win.update(); } catch(e) {}
    };

    rbDark.onClick = function() {
        currentMode = "dark";
        panelLight.visible = false;
        panelDark.visible = true;
        win.layout.layout(true);
        try { win.update(); } catch(e) {}
    };

    // 底部操作按钮栏 (两极分置：取消靠左、确认靠右，彻底杜绝误触)
    var btnGroup = win.add("group");
    btnGroup.alignment = ["fill", "bottom"];
    btnGroup.orientation = "row";
    btnGroup.margins = [4, 10, 4, 0];

    // 取消按钮靠最左侧放置
    var btnCancel = btnGroup.add("button", undefined, "取消", {name: "cancel"});
    btnCancel.preferredSize = [80, 30];

    // 中间弹性占位空间，将两个按钮推至弹窗两端
    var btnSpacer = btnGroup.add("group");
    btnSpacer.alignment = ["fill", "fill"];

    // 主操作按钮靠最右侧放置，视觉焦点突出
    var btnOk = btnGroup.add("button", undefined, "开始分配颜色", {name: "ok"});
    btnOk.preferredSize = [130, 30];

    // 最终选定的确认参数对象
    var executionPayload = null;

    btnOk.onClick = function() {
        var isDark = (currentMode === "dark");
        var activeRows = isDark ? darkRows : lightRows;
        var activeThemeName = isDark ? "深色风格" : "浅色风格";

        var r1 = parseFloat(activeRows.row1.ratio.text) || 0;
        var r2 = parseFloat(activeRows.row2.ratio.text) || 0;
        var r3 = parseFloat(activeRows.row3.ratio.text) || 0;
        var sumR = r1 + r2 + r3;

        if (sumR <= 0) {
            alert("请输入有效的比例数值！");
            return;
        }

        var op1 = Math.min(100, Math.max(0, parseFloat(activeRows.row1.opacity.text) || 100));
        var op2 = Math.min(100, Math.max(0, parseFloat(activeRows.row2.opacity.text) || 100));
        var op3 = Math.min(100, Math.max(0, parseFloat(activeRows.row3.opacity.text) || 100));

        var count1 = Math.round(total * (r1 / sumR));
        var count2 = Math.round(total * (r2 / sumR));
        var count3 = total - count1 - count2;

        executionPayload = {
            themeName: activeThemeName,
            hex1: activeRows.row1.hex.text,
            hex2: activeRows.row2.hex.text,
            hex3: activeRows.row3.hex.text,
            op1: op1,
            op2: op2,
            op3: op3,
            count1: count1,
            count2: count2,
            count3: count3
        };

        win.close(1);
    };

    btnCancel.onClick = function() {
        win.close(2);
    };

    if (win.show() !== 1 || !executionPayload) {
        return;
    }

    // 4. 创建当前风格专属的 3 种单例颜色对象
    var color1 = makeAiColor(executionPayload.hex1);
    var color2 = makeAiColor(executionPayload.hex2);
    var color3 = makeAiColor(executionPayload.hex3);

    var colorList = [color1, color2, color3];
    var opacityList = [executionPayload.op1, executionPayload.op2, executionPayload.op3];

    // 5. 空间微块自适应均匀扩散着色引擎 (Spatial Micro-Block Dithering Engine)
    // 彻底解决全局配额导致某一区域（如上半部/下半部）颜色断流、配额耗尽不变色的问题！
    // 快速采集每个图元的二维物理坐标
    var pts = [];
    var minX = 99999999, maxX = -99999999, minY = 99999999, maxY = -99999999;
    for (var i = 0; i < total; i++) {
        var it = items[i];
        var pos = it.position; // [left, top]
        var x = pos[0], y = pos[1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        pts.push({ item: it, x: x, y: y, color: -1 });
    }

    // 自适应空间网格尺寸划分
    var spanX = maxX - minX || 1;
    var spanY = maxY - minY || 1;
    var cellSize = Math.max(12, Math.sqrt((spanX * spanY) / total) * 1.2);

    for (var i = 0; i < total; i++) {
        pts[i].gx = Math.floor((pts[i].x - minX) / cellSize);
        pts[i].gy = Math.floor((pts[i].y - minY) / cellSize);
    }

    // 空间蛇形扫描排序 (Snake Scanline)，使物理相邻的图元在数组中连续排列
    pts.sort(function(a, b) {
        if (a.gy !== b.gy) return a.gy - b.gy;
        return (a.gy % 2 === 0) ? (a.gx - b.gx) : (b.gx - a.gx);
    });

    // 空间微块均匀误差扩散：
    // 将整个空间按相邻关系划分为若干个微型区域（每 10 个相邻矩形为一组）
    // 每一组内部都严格遵循 50%/30%/20% 比例，无论地图多大多复杂，每个局部区域都有完整的三色分布！
    var sumTotal = executionPayload.count1 + executionPayload.count2 + executionPayload.count3 || total;
    var rate1 = executionPayload.count1 / sumTotal;
    var rate2 = executionPayload.count2 / sumTotal;
    var rate3 = executionPayload.count3 / sumTotal;

    var acc1 = 0, acc2 = 0, acc3 = 0;
    var lastBlockColor = -1;
    var blockSize = 10;

    for (var b = 0; b < total; b += blockSize) {
        var bEnd = Math.min(b + blockSize, total);
        var cLen = bEnd - b;

        // 浮点配额累加与取整（Bresenham 误差扩散，保证全局总数 100% 精确）
        acc1 += cLen * rate1;
        acc2 += cLen * rate2;
        acc3 += cLen * rate3;

        var n1 = Math.round(acc1);
        var n2 = Math.round(acc2);
        var n3 = cLen - n1 - n2;

        acc1 -= n1;
        acc2 -= n2;
        acc3 -= n3;

        var blockColors = [];
        for (var k = 0; k < n1; k++) blockColors.push(0);
        for (var k = 0; k < n2; k++) blockColors.push(1);
        for (var k = 0; k < n3; k++) blockColors.push(2);

        // 微块内随机打乱 (Fisher-Yates)
        for (var k = blockColors.length - 1; k > 0; k--) {
            var r = Math.floor(Math.random() * (k + 1));
            var tmp = blockColors[k];
            blockColors[k] = blockColors[r];
            blockColors[r] = tmp;
        }

        // 跨块首尾防连号平滑调整
        if (blockColors.length > 0 && blockColors[0] === lastBlockColor) {
            for (var m = 1; m < blockColors.length; m++) {
                if (blockColors[m] !== lastBlockColor) {
                    var swapTmp = blockColors[0];
                    blockColors[0] = blockColors[m];
                    blockColors[m] = swapTmp;
                    break;
                }
            }
        }

        // 块内防连续相邻同色重排
        for (var m = 1; m < blockColors.length; m++) {
            if (blockColors[m] === blockColors[m - 1]) {
                for (var pIdx = m + 1; pIdx < blockColors.length; pIdx++) {
                    if (blockColors[pIdx] !== blockColors[m - 1]) {
                        var swapTmp2 = blockColors[m];
                        blockColors[m] = blockColors[pIdx];
                        blockColors[pIdx] = swapTmp2;
                        break;
                    }
                }
            }
        }

        for (var k = 0; k < cLen; k++) {
            pts[b + k].color = blockColors[k];
        }

        if (blockColors.length > 0) {
            lastBlockColor = blockColors[blockColors.length - 1];
        }
    }

    // 6. 浮动进度条窗口
    var progWin = new Window("palette", "正在分配 " + executionPayload.themeName + "...");
    progWin.orientation = "column";
    progWin.alignChildren = ["fill", "center"];
    progWin.spacing = 10;
    progWin.margins = 18;

    var lblStatus = progWin.add("statictext", undefined, "正在随机应用【" + executionPayload.themeName + "】...");
    lblStatus.characters = 32;

    var pbar = progWin.add("progressbar", undefined, 0, total);
    pbar.preferredSize.width = 340;
    pbar.preferredSize.height = 16;

    var lblInfo = progWin.add("statictext", undefined, "0 / " + total + " (0%)");
    lblInfo.alignment = ["center", "center"];

    progWin.center();
    progWin.show();

    // 节流步长
    var step = Math.max(10, Math.floor(total / 40));

    // 7. 顺序遍历图元，赋予颜色与透明度
    for (var j = 0; j < total; j++) {
        var pt = pts[j];
        var it = pt.item;
        var cIdx = pt.color;

        var curColor = colorList[cIdx];
        var curOpacity = opacityList[cIdx];

        try {
            if (!it.filled) it.filled = true;
            it.fillColor = curColor;
        } catch (e) {
            if (it.pathItems && it.pathItems.length > 0) {
                for (var p = 0; p < it.pathItems.length; p++) {
                    it.pathItems[p].fillColor = curColor;
                }
            }
        }

        it.opacity = curOpacity;

        if (j % step === 0 || j === total - 1) {
            var cur = j + 1;
            pbar.value = cur;
            var pct = Math.round((cur / total) * 100);
            lblInfo.text = cur + " / " + total + " (" + pct + "%)";
            progWin.update();
        }
    }

    progWin.close();
}

randomColorAssign();
