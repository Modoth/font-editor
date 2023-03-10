class FontName {
  constructor() {
    this.copyright = ''
    this.fontFamily = ''
    this.fontSubfamily = ''
    this.fullName = ''
    this.postScriptName = ''
    this.trademark = ''
    this.uniqueID = ''
    this.version = ''
    this.registerAllProperties()
  }
}

class Glyph {
  constructor() {
    this.paths = undefined
    this.savedPaths = undefined
    this.data = undefined
    this.ttfPath = undefined
  }
}

class Font {
  constructor() {
    this.names = {}
    this.glyphs = []
    this.registerAllProperties()
  }
  addName(lang) {
    this.names.registerProperties(lang)
    this.names[lang] = new FontName()
  }

  static parse(data) {
    const font = new Font()
    if (data.names) {
      for (let p in data.names) {
        const pi = data.names[p]
        for (let l in pi) {
          if (!font.names[l]) {
            font.addName(l)
          }
          font.names[l][p] = pi[l]
        }
      }
    }
    font.data = data
    font.glyphs = Object.fromEntries(Object.keys(data.glyphs.glyphs).map(g => {
      const glyph = new Glyph()
      glyph.data = data.glyphs.glyphs[g]
      return [glyph.data.unicode, glyph]
    }))
    return font
  }
}

class Cell {
  constructor(x, y, width) {
    this.x = x
    this.y = y
    this.id = x + y * width
    this.char = undefined
    this.unicode = undefined
    this.glyph = undefined
    this.registerAllProperties()
  }
}

class App {
  constructor() {
    /** @type { Object.<string,HTMLElement> } */
    this.components
    this.font = undefined
    this.currentCell = undefined
    this.startUnicode = 0
    this.startChar = ''
    this.endUnicode = 0
    this.endChar = ''
    this.cells = undefined
    this.currentChanged = false
    this.cellsWidth = 0
    this.cellsHeight = 0
    this.cellsCount = 0
    this.cellSize = 40
    this.editingFontSize = 60
    this.canvasSize = this.editingFontSize * 2
    this.originalFontStyle = ''
    this.editingFontStyle = ''
    this.originalFontUrl = ''
    this.editingFontUrl = ''
    this.originalFont = 'OriginalFont'
    this.editingFont = 'EditingFont'
    this.previewing = false
    this.fontFamily = this.originalFont
    this.registerAllProperties()
  }

  initData() { }
  start() {
    /** @type { { toast:(msg:string, timeout:number = 1000)=>Promise<any> } } */
    this.modal_ = this.components.modal.model
    this.resize()
    this.bindHandWrite(this.components.editorFg, this.components.editorFgTmp)
  }

  saveCurrentWord() {
    if (!this.currentCell?.glyph) {
      return
    }
    if (!this.currentCell.glyph.paths?.length) {
      return
    }
    this.currentCell.glyph.savedPaths = this.currentCell.glyph.paths
    const ttfPath = new opentype.Path();
    const { ascender, descender, unitsPerEm } = this.font.data
    const boxSize = Math.ceil((ascender - descender) / unitsPerEm * this.editingFontSize)
    const bb = Math.floor(this.canvasSize / 2 - boxSize / 2)
    const base = Math.ceil(ascender / unitsPerEm * this.editingFontSize) + bb
    for (const paths of this.currentCell.glyph.savedPaths) {
      const start = paths.shift()
      if (!start || !paths.length) {
        continue
      }
      ttfPath.moveTo(...start[0])
      for (let [[x, y]] of paths) {
        x = (x - bb) * unitsPerEm / this.editingFontSize
        y = (base - y) * unitsPerEm / this.editingFontSize
        ttfPath.lineTo(x, y)
      }
    }
    this.currentCell.glyph.ttfPath = ttfPath
  }

  preWord() {
    if (!this.currentCell) {
      this.selectCell(this.cells[this.cellsHeight - 1][this.cellsWidth - 1])
      return
    }
    let { x, y } = this.currentCell
    x--
    if (x < 0) {
      y--
      x = this.cellsWidth - 1
    }
    if (y < 0) {
      this.prePage(true)
      return
    }
    this.selectCell(this.cells[y][x])
  }

  nextWord() {
    if (!this.currentCell) {
      this.selectCell(this.cells[0][0])
      return
    }
    let { x, y } = this.currentCell
    x++
    if (x >= this.cellsWidth) {
      y++
      x = 0
    }
    if (y >= this.cellsHeight) {
      this.nextPage()
      return
    }
    this.selectCell(this.cells[y][x])
  }

  firstPage() {
    this.updateCells(0, 0)
  }

  nextPage() {
    this.updateCells(this.cells[0][0].unicode + this.cellsWidth * this.cellsHeight)
  }

  prePage(selectLast = false) {
    let startUnicode = this.cells[0][0].unicode
    if (startUnicode === 0) {
      return
    }
    startUnicode -= this.cellsWidth * this.cellsHeight
    startUnicode = Math.max(0, startUnicode)
    this.updateCells(startUnicode, selectLast ? (startUnicode + this.cellsWidth * this.cellsHeight - 1) : undefined)
  }

  previewFont() {
    this.saveFont()
    this.previewing = true
  }

  async saveFont(full = false) {
    if (this.currentCell) {
      this.saveCurrentWord()
    }
    const glyhs = Object.values(this.font.glyphs).filter(g => g.ttfPath || (full && g.data))
    const notdefGlyph = new opentype.Glyph({
      name: '.notdef',
      advanceWidth: 650,
      path: new opentype.Path()
    });
    const glyphs = [notdefGlyph];
    for (const g of glyhs) {
      if (g.ttfPath) {
        glyphs.push(new opentype.Glyph({
          name: String.fromCodePoint(g.unicode),
          unicode: g.unicode,
          advanceWidth: 650,
          path: g.ttfPath
        }))
      } else {
        glyphs.push(g.data)
      }
    }
    const { ascender, descender, unitsPerEm } = this.font.data
    const font = new opentype.Font({
      familyName: this.font.data.names.fontFamily.en,
      styleName: this.font.data.names.fontSubfamily.en,
      unitsPerEm,
      ascender,
      descender,
      glyphs: glyphs
    });
    const fontFile = new File([font.toArrayBuffer()], this.editingFont + '.otf')
    if (this.editingFontUrl) {
      URL.revokeObjectURL(this.editingFontUrl)
    }
    this.editingFontUrl = URL.createObjectURL(fontFile)
    this.editingFontStyle = `@font-face {
      font-family: ${this.editingFont};
      src: url("${this.editingFontUrl}");
      font-weight: normal;
      font-style: normal;
    }`
    return font
  }

  async downloadFont() {
    const font = await this.saveFont(true)
    font.download()
  }

  drawPaths(paths, ctx) {
    for (let points of paths) {
      const smooth = 0.5
      ctx.beginPath();
      points = points.map(([[x, y]]) => ({ x, y }))
      let prePreviousPointX, prePreviousPointY, previousPointX, previousPointY, currentPointX, currentPointY, nextPointX, nextPointY;
      for (let valueIndex = 0; valueIndex < points.length; valueIndex++) {
        if (currentPointX) {
          let point = points[valueIndex];
          currentPointX = point.x;
          currentPointY = point.y;
        }
        if (previousPointX) {
          if (valueIndex > 0) {
            let point = points[valueIndex - 1];
            previousPointX = point.x;
            previousPointY = point.y;
          } else {
            previousPointX = currentPointX;
            previousPointY = currentPointY;
          }
        }

        if (prePreviousPointX) {
          if (valueIndex > 1) {
            let point = points[valueIndex - 2];
            prePreviousPointX = point.x;
            prePreviousPointY = point.y;
          } else {
            prePreviousPointX = previousPointX;
            prePreviousPointY = previousPointY;
          }
        }

        if (valueIndex < points.length - 1) {
          let point = points[valueIndex + 1];
          nextPointX = point.x;
          nextPointY = point.y;
        } else {
          nextPointX = currentPointX;
          nextPointY = currentPointY;
        }

        if (valueIndex == 0) {
          ctx.moveTo(points[0].x, points[0].y);
        } else {
          let firstDiffX = (currentPointX - prePreviousPointX);
          let firstDiffY = (currentPointY - prePreviousPointY);
          let secondDiffX = (nextPointX - previousPointX);
          let secondDiffY = (nextPointY - previousPointY);
          let firstControlPointX = previousPointX + (smooth * firstDiffX);
          let firstControlPointY = previousPointY + (smooth * firstDiffY);
          let secondControlPointX = currentPointX - (smooth * secondDiffX);
          let secondControlPointY = currentPointY - (smooth * secondDiffY);
          ctx.bezierCurveTo(firstControlPointX, firstControlPointY, secondControlPointX, secondControlPointY,
            currentPointX, currentPointY);

        }

        prePreviousPointX = previousPointX;
        prePreviousPointY = previousPointY;
        previousPointX = currentPointX;
        previousPointY = currentPointY;
        currentPointX = nextPointX;
        currentPointY = nextPointY;
      }
      ctx.stroke();
    }
  }

  bindHandWrite(/**@type {HTMLCanvasElement}*/canvas, tmpCanvas) {
    let writing = false
    let handPeriod = 20
    let lastWriteTime = 0
    /**@type {CanvasRenderingContext2D} */
    let ctx = undefined
    let tmpCtx = undefined
    let poses = undefined

    const getPos = (ev) => {
      if (ev.touches[0]) {
        const { x, y } = canvas.getClientRects()[0]
        return [ev.touches[0].clientX - x, ev.touches[0].clientY - y]
      }
      const { offsetX, offsetY } = ev
      return [offsetX, offsetY]
    }
    let lastPos = undefined
    const startHandwrite = (/**@type {MouseEvent}*/ev) => {
      writing = true
      lastWriteTime = Date.now()
      const pos = getPos(ev)
      poses = []
      poses.push([pos, lastWriteTime])
      lastPos = pos
      ctx = canvas.getContext('2d')
      ctx.strokeStyle = 'lightcoral'
      ctx.lineWidth = 4
      tmpCtx = tmpCanvas.getContext('2d')
      tmpCtx.strokeStyle = 'coral'
      tmpCtx.lineWidth = 4
    }
    const finishHandWrite = () => {
      writing = false
      tmpCtx.clearRect(0, 0, this.canvasSize, this.canvasSize)
      this.drawPaths([poses], ctx);
      if (this.currentCell?.glyph?.paths) {
        this.currentCell.glyph.paths.push(poses)
      }
      this.currentChanged = true
    }

    const handWrite = (/**@type {MouseEvent}*/ev) => {
      if (!writing) {
        return
      }
      ev.stopPropagation()
      ev.preventDefault()
      const now = Date.now()
      const remain = lastWriteTime + handPeriod - now
      if (remain > 0) {
        return
      }
      const pos = getPos(ev)
      poses.push([pos, now])
      tmpCtx.beginPath()
      tmpCtx.moveTo(...lastPos)
      tmpCtx.lineTo(...pos)
      tmpCtx.stroke()
      lastPos = pos
      lastWriteTime = Date.now()
    }
    // canvas.onmousedown = startHandwrite
    // canvas.onmousemove = handWrite
    // canvas.onmouseleave = finishHandWrite
    // canvas.onmouseup = finishHandWrite
    canvas.ontouchstart = startHandwrite
    canvas.ontouchmove = handWrite
    canvas.ontouchend = finishHandWrite
    canvas.ontouchcancel = finishHandWrite
  }

  resize() {
    const width = Math.floor(this.components.cellsPanel.clientWidth / this.cellSize)
    const height = Math.floor((this.components.cellsPanel.clientHeight) / this.cellSize)
    this.cells = Array.from({ length: height }).map((_, y) => Array.from({ length: width }).map((_, x) => new Cell(x, y, width)))
    this.cellsWidth = width
    this.cellsHeight = height
    this.cellsCount = width * height
  }

  resetCurrentWord() {
    if (!this.currentCell?.glyph) {
      return
    }
    this.selectCell(this.currentCell, true)
  }

  deleteCurrentWord() {
    if (!this.currentCell?.glyph) {
      return
    }
    this.currentCell.glyph.paths = []
    this.currentCell.glyph.savedPaths = undefined
    this.currentCell.glyph.ttfPath = undefined
    this.selectCell(this.currentCell, true)
  }

  selectCell(cell, force = false) {
    if (!force && this.currentCell?.glyph === cell?.glyph) {
      return
    }
    this.currentChanged = false
    this.currentCell = cell
    /**@type {CanvasRenderingContext2D } */
    const ctxBg = this.components.editorBg.getContext("2d");
    this.components.editorBg.width = this.canvasSize
    this.components.editorBg.height = this.canvasSize
    /**@type {CanvasRenderingContext2D } */
    const ctxFg = this.components.editorFg.getContext("2d");
    this.components.editorFg.width = this.canvasSize
    this.components.editorFg.height = this.canvasSize
    ctxBg.clearRect(0, 0, this.canvasSize, this.canvasSize)
    ctxFg.clearRect(0, 0, this.canvasSize, this.canvasSize)
    const { ascender, descender, unitsPerEm } = this.font.data
    const boxSize = Math.ceil((ascender - descender) / unitsPerEm * this.editingFontSize)
    const bb = Math.floor(this.canvasSize / 2 - boxSize / 2)
    const base = Math.ceil(ascender / unitsPerEm * this.editingFontSize) + bb
    if (cell.char) {
      const fontSize = this.editingFontSize
      ctxBg.font = `${fontSize}px ${this.fontFamily}`
      ctxBg.fillStyle = "#2d2d2d";
      ctxBg.textAlign = 'center'
      ctxBg.fillText(cell.char, this.canvasSize / 2, base)
    }
    if (this.currentCell?.glyph) {
      this.currentCell.glyph.paths = [...(this.currentCell.glyph.savedPaths || [])]
      if (this.currentCell.glyph.paths?.length) {
        ctxFg.strokeStyle = 'lightcoral'
        ctxFg.lineWidth = 4
        this.drawPaths(this.currentCell.glyph.paths, ctxFg)
      }
    }
  }

  updateCells(startUnicode, currentUnicode) {
    const cellsHeight = this.cells.length
    const cellsWidth = this.cells[0]?.length || 0
    if (startUnicode === undefined && currentUnicode === undefined) {
      startUnicode = 0
      currentUnicode = 0
    }
    if (startUnicode === undefined) {
      startUnicode = Math.max(0, currentUnicode - Math.floor(cellsHeight / 2) * cellsWidth - Math.floor(cellsWidth / 2))
    } else if (currentUnicode === undefined) {
      currentUnicode = startUnicode
    }
    for (const row of this.cells) {
      for (const cell of row) {
        cell.unicode = startUnicode + cell.id
        cell.char = String.fromCharCode(cell.unicode)
        cell.glyph = this.font.glyphs[cell.unicode]
        if (!cell.glyph) {
          this.font.glyphs[cell.unicode] = new Glyph()
          cell.glyph = this.font.glyphs[cell.unicode]
        }
        cell.glyph.unicode = cell.unicode
        if (cell.unicode === currentUnicode) {
          this.selectCell(cell)
        }
      }
    }
    this.startUnicode = startUnicode
    this.startChar = String.fromCharCode(this.startUnicode)
    this.endUnicode = startUnicode + this.cellsCount
    this.endChar = String.fromCharCode(this.endUnicode)
  }

  async jumpTo() {
    const to = await this.modal_.prompt('Jump to:')
    if (to === undefined || to === null || to === '') {
      return
    }
    const selectUnicode = to.length === 1 ? to.charCodeAt(0) : Number.parseInt(to)
    this.updateCells(undefined, selectUnicode)
  }

  drawEditingBox() {
    // ascender
    // descender
    /**@type {HTMLCanvasElement} */
    const canvas = this.components.editorBox
    canvas.width = this.canvasSize
    canvas.height = this.canvasSize
    const { ascender, descender, unitsPerEm } = this.font.data
    const boxSize = Math.ceil((ascender - descender) / unitsPerEm * this.editingFontSize)
    const bb = Math.floor(this.canvasSize / 2 - boxSize / 2)
    const base = Math.ceil(ascender / unitsPerEm * this.editingFontSize) + bb
    const be = Math.ceil(this.canvasSize / 2 + boxSize / 2)
    const ctx = canvas.getContext('2d')
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = '#2d2d2d'
    ctx.beginPath()
    ctx.moveTo(bb, bb)
    ctx.lineTo(bb, be)
    ctx.lineTo(be, be)
    ctx.lineTo(be, bb)
    ctx.lineTo(bb, bb)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(this.canvasSize / 2, 0)
    ctx.lineTo(this.canvasSize / 2, this.canvasSize)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, base)
    ctx.lineTo(this.canvasSize, base)
    ctx.stroke()
  }

  async handleFile($event) {
    /**@type {File} */
    const file = $event.target.files[0]
    if (!file) {
      return
    }
    this.currentCell = undefined
    this.originalFontStyle = undefined
    if (this.originalFontUrl) {
      URL.revokeObjectURL(this.originalFontUrl)
    }
    this.editingFontStyle = undefined
    if (this.editingFontUrl) {
      URL.revokeObjectURL(this.editingFontUrl)
    }
    const data = await file.arrayBuffer()
    const font = opentype.parse(data);
    this.font = Font.parse(font)
    this.drawEditingBox()
    this.updateCells()
    this.originalFontUrl = URL.createObjectURL(file)
    this.originalFontStyle = `@font-face {
      font-family: ${this.fontFamily};
      src: url("${this.originalFontUrl}") format('truetype');
      font-weight: normal;
      font-style: normal;
    }`
  }
}
