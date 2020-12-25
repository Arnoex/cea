const fetch = require('node-fetch')
const crypto = require('crypto')
const { v1 } = require('uuid')

const log = require('../interface/colorLog')

class campusphereApp {
  constructor(school) {
    this.signApi = {
      list: `${school.origin}/wec-counselor-sign-apps/stu/sign/getStuSignInfosInOneDay`,
      detail: `${school.origin}/wec-counselor-sign-apps/stu/sign/detailSignInstance`,
      sign: `${school.origin}/wec-counselor-sign-apps/stu/sign/submitSign`,
      home: `${school.origin}/wec-counselor-sign-apps/stu/mobile`,
      addr: school.addr,
    }
  }
}

exports.signApp = class signApp extends (
  campusphereApp
) {
  constructor(school, user) {
    super(school)
    this.headers = {
      'user-agent':
        'Mozilla/5.0 (Linux; Android 10; GM1910 Build/QKQ1.190716.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.101 Mobile Safari/537.36  cpdaily/8.2.13 wisedu/8.2.13',
      'content-type': 'application/json',
      connection: 'keep-alive',
    }
    this.user = user
  }

  async getCookie(cookie) {
    if (!cookie.campusphere.includes('acw_tc')) {
      const res = await fetch(this.signApi.home, {
        headers: this.headers,
      })
      res.headers.raw()['set-cookie'].forEach(e => {
        cookie.campusphere += ';' + e.match(/^(\w|\d|\s)+\=(\w|\d|\s|\-)+;/)[0]
      }, '')
    }
    return cookie.campusphere
  }

  async signInfo(cookie) {
    // set acw_tc for user provided cookie
    this.headers.cookie = await this.getCookie(cookie)

    const { signApi, headers } = this
    try {
      const res = await fetch(signApi.list, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      })
      if (res.headers.hasOwnProperty('set-cookie')) return true
      const signQ = await res.json()
      this.curTask = signQ.datas.unSignedTasks[0]
      return false
    } catch (e) {
      log.object(e)
      return true
    }
  }

  async signWithForm() {
    const { signApi, headers } = this
    const {
      curTask: { signInstanceWid, signWid },
    } = this

    let res = await fetch(signApi.detail, {
      headers,
      method: 'POST',
      body: JSON.stringify({ signInstanceWid, signWid }),
    })

    const signDetails = await res.json()
    let {
      extraField,
      longitude,
      latitude,
      isMalposition,
      signPlaceSelected,
      isNeedExtra,
      signedStuInfo,
    } = signDetails.datas

    const placeList = signPlaceSelected

    ;[longitude, latitude] = this.locale(placeList[0])

    const extraFieldItems = this.fillExtra(extraField)

    const form = {
      signInstanceWid,
      longitude,
      latitude,
      isMalposition,
      abnormalReason: '',
      signPhotoUrl: '',
      position: signApi.addr,
      isNeedExtra,
      extraFieldItems,
    }
    headers['Cpdaily-Extension'] = this.extention(form)

    res = await fetch(signApi.sign, {
      headers,
      method: 'POST',
      body: JSON.stringify(form),
    })
    res = await res.json()
    log.warning(
      `${this.user.alias || this.user.username} 的签到结果: ${res.message}`
    )
  }

  // construct coordinates & format coordinates length
  locale({ longitude, latitude }) {
    return [longitude.slice(0, 10), latitude.slice(0, 9)].map(e => {
      if (e[e.length - 1] === '0') {
        e = e.replace(/\d{1}$/, '1')
      }
      return Number(e)
    })
  }

  // select right item with content&wid
  fillExtra(extraField) {
    return extraField.map(e => {
      let chosenWid
      const normal = e.extraFieldItems.filter(i => {
        if (i.isAbnormal === false) chosenWid = i.wid
        return !i.isAbnormal
      })[0]
      return {
        extraFieldItemWid: chosenWid,
        extraFieldItemValue: normal.content,
      }
    })
  }

  // construct and encrypte Cpdaily_Extension for header
  extention(form) {
    const Cpdaily_Extension = {
      lon: form.longitude.toString(),
      model: 'OPPO R11 Plus',
      appVersion: '8.1.14',
      systemVersion: '4.4.4',
      userId: this.user.username,
      systemName: 'android',
      lat: form.latitude.toString(),
      deviceId: v1(),
    }
    return this.encrypt(Cpdaily_Extension)
  }

  /**
   * Device info: using AES encryption
   *
   * @param {Object} ce device info
   * @param {String} encrypted
   */
  encrypt(ce) {
    const algorithm = 'des-cbc'
    const key = 'ST83=@XV'
    const iv = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]) // Initialization vector.

    const cipher = crypto.createCipheriv(algorithm, key, iv)

    let encrypted = cipher.update(JSON.stringify(ce), 'utf8', 'base64')
    encrypted += cipher.final('base64')
    return encrypted
  }

  // useful when key updates
  decrypt() {
    const algorithm = 'des-cbc'
    const key = 'ST83=@XV'
    const iv = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]) // Initialization vector.
    const decipher = crypto.createDecipheriv(algorithm, key, iv)
    const encrypted = 'long base 64'

    let decrypted = decipher.update(encrypted, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
  }
}
