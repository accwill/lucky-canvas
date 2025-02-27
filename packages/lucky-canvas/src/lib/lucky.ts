import '../utils/polyfill'
import { isExpectType, throttle } from '../utils/index'
import { name, version } from '../../package.json'
import { ConfigType, UserConfigType, ImgType } from '../types/index'
import { defineReactive } from '../observer'
import Watcher, { WatchOptType } from '../observer/watcher'

export default class Lucky {
  protected readonly version: string = version
  protected readonly config: ConfigType
  protected readonly ctx: CanvasRenderingContext2D
  protected htmlFontSize: number = 16
  protected rAF: Function = function () {}
  protected boxWidth: number = 0
  protected boxHeight: number = 0

  /**
   * 公共构造器
   * @param config
   */
  constructor (config: string | HTMLDivElement | UserConfigType) {
    // 兼容代码开始: 为了处理 v1.0.6 版本在这里传入了一个 dom
    if (typeof config === 'string') config = { el: config } as UserConfigType
    else if (config.nodeType === 1) config = { el: '', divElement: config } as UserConfigType
    // 这里先野蛮的处理, 等待后续优化, 对外暴露的类型是UserConfigType, 但内部期望是ConfigType
    config = config as UserConfigType
    this.config = config as ConfigType
    // 开始初始化
    if (!config.flag) config.flag = 'WEB'
    if (config.el) config.divElement = document.querySelector(config.el) as HTMLDivElement
    // 如果存在父盒子, 就创建canvas标签
    if (config.divElement) {
      // 无论盒子内有没有canvas都执行覆盖逻辑
      config.canvasElement = document.createElement('canvas')
      config.divElement.appendChild(config.canvasElement)
    }
    // 获取 canvas 上下文
    if (config.canvasElement) {
      config.ctx = config.canvasElement.getContext('2d')!
      // 添加版本信息到标签上, 方便定位版本问题
      config.canvasElement.setAttribute('package', `${name}@${version}`)
      config.canvasElement.addEventListener('click', e => this.handleClick(e))
    }
    this.ctx = config.ctx as CanvasRenderingContext2D
    // 初始化 window 方法
    this.initWindowFunction()
    // 如果最后得不到 canvas 上下文那就无法进行绘制
    if (!this.config.ctx) {
      console.error('无法获取到 CanvasContext2D')
    }
    // 监听 window 触发 resize 时重置
    window && window.addEventListener('resize', throttle(() => {
      this.init()
    }, 300))
  }

  public init() {}

  /**
   * 初始化方法
   */
   protected initLucky () {
    // 先初始化 fontSize 以防后面有 rem 单位
    this.setHTMLFontSize()
    // 拿到 config 即可设置 dpr
    this.setDpr()
    // 初始化宽高
    this.resetWidthAndHeight()
    // 根据 dpr 来缩放 canvas
    this.zoomCanvas()
    if (!this.boxWidth || !this.boxHeight) {
      console.error('无法获取到宽度或高度')
      return
    }
  }

  /**
   * 鼠标点击事件
   * @param e 事件参数
   */
  protected handleClick (e: MouseEvent): void {}

  /**
   * 根标签的字体大小
   */
  protected setHTMLFontSize (): void {
    if (!window) return
    this.htmlFontSize = +window.getComputedStyle(document.documentElement).fontSize.slice(0, -2)
  }

  /**
   * 设备像素比
   * window 环境下自动获取, 其余环境手动传入
   */
  protected setDpr (): void {
    const { config } = this
    if (config.dpr) {
      // 优先使用 config 传入的 dpr
    } else if (window) {
      window['dpr'] = config.dpr = window.devicePixelRatio || 1
    } else if (!config.dpr) {
      console.error(config, '未传入 dpr 可能会导致绘制异常')
    }
  }

  /**
   * 重置盒子和canvas的宽高
   */
  private resetWidthAndHeight (): void {
    const { config } = this
    // 如果是浏览器环境并且存在盒子
    let boxWidth = 0, boxHeight = 0
    if (config.divElement) {
      boxWidth = config.divElement.offsetWidth
      boxHeight = config.divElement.offsetHeight
    }
    // 如果 config 上面没有宽高, 就从 style 上面取
    this.boxWidth = this.getLength(config.width) || boxWidth
    this.boxHeight = this.getLength(config.height) || boxHeight
    // 重新把宽高赋给盒子
    if (config.divElement) {
      config.divElement.style.overflow = 'hidden'
      config.divElement.style.width = this.boxWidth + 'px'
      config.divElement.style.height = this.boxHeight + 'px'
    }
  }

  /**
   * 根据 dpr 缩放 canvas 并处理位移
   */
  protected zoomCanvas (): void {
    const { config, ctx } = this
    const { canvasElement, dpr } = config
    const [width, height] = [this.boxWidth * dpr, this.boxHeight * dpr]
    const compute = (len: number) => (len * dpr - len) / (len * dpr) * (dpr / 2) * 100
    if (!canvasElement) return
    canvasElement.width = width
    canvasElement.height = height
    canvasElement.style.width = `${width}px`
    canvasElement.style.height = `${height}px`
    canvasElement.style.transform = `scale(${1 / dpr}) translate(${-compute(width)}%, ${-compute(height)}%)`
    ctx.scale(dpr, dpr)
  }

  /**
   * 从 window 对象上获取一些方法
   */
  private initWindowFunction (): void {
    const { config } = this
    if (window) {
      this.rAF = window.requestAnimationFrame ||
        window['webkitRequestAnimationFrame'] ||
        window['mozRequestAnimationFrame'] ||
        function (callback: Function) {
          window.setTimeout(callback, 1000 / 60)
        }
      config.setTimeout = window.setTimeout
      config.setInterval = window.setInterval
      config.clearTimeout = window.clearTimeout
      config.clearInterval = window.clearInterval
      return
    }
    if (config.rAF) {
      // 优先使用帧动画
      this.rAF = config.rAF
    } else if (config.setTimeout) {
      // 其次使用定时器
      const timeout = config.setTimeout
      this.rAF = (callback: Function): number => timeout(callback, 16.7)
    } else {
      // 如果config里面没有提供, 那就假设全局方法存在setTimeout
      this.rAF = (callback: Function): number => setTimeout(callback, 16.7)
    }
  }

  /**
   * 异步加载图片并返回图片的几何信息
   * @param src 图片路径
   * @param info 图片信息
   */
  protected loadImg (
    src: string,
    info: ImgType,
    resolveName = '$resolve'
  ): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      if (!src) reject(`=> '${info.src}' 不能为空或不合法`)
      if (this.config.flag === 'WEB') {
        let imgObj = new Image()
        imgObj.onload = () => resolve(imgObj)
        imgObj.onerror = () => reject(`=> '${info.src}' 图片加载失败`)
        imgObj.src = src
      } else {
        // 其余平台向外暴露, 交给外部自行处理
        info[resolveName] = resolve
        info['$reject'] = reject
        return
      }
    })
  }

  /**
   * 公共绘制图片的方法
   * @param imgObj 图片对象
   * @param rectInfo: [x轴位置, y轴位置, 渲染宽度, 渲染高度] 
   */
  protected drawImage (
    imgObj: HTMLImageElement,
    ...rectInfo: [number, number, number, number]
  ): void {
    let drawImg, { config, ctx } = this
    if (['WEB', 'MP-WX'].includes(config.flag)) {
      // 浏览器和新版小程序中直接绘制即可
      drawImg = imgObj
    } else if (['UNI-H5', 'UNI-MP', 'TARO-H5', 'TARO-MP'].includes(config.flag)) {
      // 旧版本的小程序需要绘制 path, 这里特殊处理一下
      type OldImageType = HTMLImageElement & { path: CanvasImageSource }
      drawImg = (imgObj as OldImageType).path
    } else {
      // 如果传入了未知的标识
      return console.error('意料之外的 flag, 该平台尚未兼容!')
    }
    return ctx.drawImage(drawImg, ...rectInfo)
  }

  /**
   * 获取长度
   * @param length 将要转换的长度
   * @return 返回长度
   */
  protected getLength (length: string | number | undefined): number {
    if (isExpectType(length, 'number')) return length as number
    if (isExpectType(length, 'string')) return this.changeUnits(length as string)
    return 0
  }

  /**
   * 转换单位
   * @param { string } value 将要转换的值
   * @param { number } denominator 分子
   * @return { number } 返回新的字符串
   */
  protected changeUnits (value: string, denominator = 1): number {
    return Number(value.replace(/^([-]*[0-9.]*)([a-z%]*)$/, (value, num, unit) => {
      const unitFunc = {
        '%': (n: number) => n * (denominator / 100),
        'px': (n: number) => n * 1,
        'rem': (n: number) => n * this.htmlFontSize,
        'vw': (n: number) => n / 100 * window.innerWidth,
      }[unit]
      if (unitFunc) return unitFunc(num)
      // 如果找不到默认单位, 就交给外面处理
      const otherUnitFunc = this.config.unitFunc
      return otherUnitFunc ? otherUnitFunc(num, unit) : num
    }))
  }

  /**
   * 添加一个新的响应式数据 (临时)
   * @param data 数据
   * @param key 属性
   * @param value 新值
   */
  public $set (data: object, key: string | number, value: any) {
    if (!data || typeof data !== 'object') return
    defineReactive(data, key, value)
  }

  /**
   * 添加一个属性计算 (临时)
   * @param data 源数据
   * @param key 属性名
   * @param callback 回调函数
   */
  protected $computed (data: object, key: string, callback: Function) {
    Object.defineProperty(data, key, {
      get: () => {
        return callback.call(this)
      }
    })
  }

  /**
   * 添加一个观察者 create user watcher
   * @param expr 表达式
   * @param handler 回调函数
   * @param watchOpt 配置参数
   * @return 卸载当前观察者的函数 (暂未返回)
   */
  protected $watch (
    expr: string | Function,
    handler: Function | WatchOptType,
    watchOpt: WatchOptType = {}
  ): Function {
    if (typeof handler === 'object') {
      watchOpt = handler
      handler = watchOpt.handler!
    }
    // 创建 user watcher
    const watcher = new Watcher(this, expr, handler, watchOpt)
    // 判断是否需要初始化时触发回调
    if (watchOpt.immediate) {
      handler.call(this, watcher.value)
    }
    // 返回一个卸载当前观察者的函数
    return function unWatchFn () {}
  }
}
