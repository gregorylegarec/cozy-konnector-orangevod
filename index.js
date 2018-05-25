process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const {
  BaseKonnector,
  log,
  request,
  updateOrCreate
} = require('cozy-konnector-libs')

const DOCTYPE = 'fr.orange.videostream'
const DOCTYPE_VERSION = 'cozy-konnector-orangelivebox 2.0.0'
const API_ROOT = 'https://mesinfos.orange.fr'

const rq = request({
  // debug: true
})

module.exports = new BaseKonnector(function fetch(fields) {
  fields.remember = this.getAccountData().remember || {}
  return checkToken(fields)
    .then(() => downloadVod(fields))
    .then(entries =>
      updateOrCreate(entries, DOCTYPE, ['clientId', 'timestamp'])
    )
    .then(() => {
      this.saveAccountData(fields.remember)
    })
})

function checkToken(fields) {
  const token = fields.access_token
  if (!token) {
    log('warn', 'token not found')
    throw new Error('LOGIN_FAILED')
  }

  try {
    let payload = token.split('.')[1]
    payload = JSON.parse(Buffer.from(payload, 'base64').toString())

    log('debug', payload)

    if (payload.token_type !== 'fixe') {
      log('warn', `Wrong token_type for this konnector: ${payload.token_type}`)
    }
    return Promise.resolve()
  } catch (e) {
    log('error', `Unexpected token format: ${e}`)
    throw new Error('LOGIN_FAILED')
  }
}

function downloadVod(fields) {
  log('info', 'Downloading vod data from Orange...')
  let uri = `${API_ROOT}/data/vod`
  if (fields.remember.lastVideoStream) {
    uri += `?start=${fields.remember.lastVideoStream.slice(0, 19)}`
  }
  return requestOrange(uri, fields.access_token).then(body => {
    const videostreams = []
    if (body && body.forEach) {
      body.forEach(vod => {
        if (
          vod.ts &&
          (!fields.remember.lastVideoStream ||
            fields.remember.lastVideoStream < vod.ts)
        ) {
          fields.remember.lastVideoStream = vod.ts
        }

        if (vod.err) {
          return
        }

        videostreams.push({
          docTypeVersion: DOCTYPE_VERSION,
          content: {
            type: vod.cont_type,
            title: vod.cont_title,
            subTitle: vod.cont_subtitle,
            duration: vod.cont_duration,
            quality: vod.cont_format,
            publicationYear: vod.prod_dt,
            country: vod.prod_nat,
            id: vod.cont_id,
            longId: vod.src_id,
            adultLevel:
              vod.adult_level === 'none' ? undefined : vod.adult_level,
            csaCode: vod.csa_code
          },
          price: vod.price,
          timestamp: vod.ts,
          viewingDuration: vod.use_duration
            ? Math.round(Number(vod.use_duration) * 60)
            : undefined,
          details: {
            offer: vod.offer,
            offerName: vod.offer_name,
            service: vod.service,
            network: vod.net,
            techno: vod.techno,
            device: vod.device,
            platform: vod.platf
          },
          action: vod.action, // visualisation or command
          clientId: vod.line_id
        })
      })
      return videostreams
    }
  })
}

// Helpers //
function requestOrange(uri, token) {
  log('info', uri)
  return rq({
    url: uri,
    auth: { bearer: token }
  }).catch(err => {
    log('error', `Download failed: ${err}`)
    console.log(err, 'error details')
  })
}
