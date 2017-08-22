'use strict'

const request = require('request')
// require('request-debug')(request)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const {log, updateOrCreate, models} = require('cozy-konnector-libs')
const baseKonnector = require('./base_konnector_with_remember')

const VideoStream = models.baseModel.createNew({name: 'fr.orange.videostream', displayName: 'videostream'})

const DOCTYPE_VERSION = 'cozy-konnector-orangelivebox 2.0.0'
const API_ROOT = 'https://mesinfos.orange.fr'

/*
 * The goal of this connector is to fetch event from facebook and store them
 * in the Cozy
 */
const connector = module.exports = baseKonnector.createNew({
  name: 'Orange Livebox',
  customView: '<%t konnector customview orange_livebox %>',

  // category: 'isp',
  // color: {
  //   hex: '#FF6600',
  //   css: '#FF6600'
  // },
  // dataType: ['videostream'],
  models: [VideoStream],

  fetchOperations: [
    initProperties,
    checkToken,
    downloadVod,
    updateOrCreate(null, VideoStream, ['clientId', 'timestamp'])
    // buildNotifContent
  ]

})

function initProperties (requiredFields, entries, data, next) {
  requiredFields.remember = requiredFields.remember || {}
  next()
}

function checkToken (requiredFields, entries, data, next) {
  const token = requiredFields.access_token
  if (!token) { return next('token not found') }

  try {
    let payload = token.split('.')[1]
    payload = JSON.parse(new Buffer(payload, 'base64').toString())
    log('info', payload)

    if (payload.token_type !== 'fixe') {
      log('warning', `Wrong token_type for this konnector: ${payload.token_type}`)
    // TODO: stub:  return next('not fixe token')
    }

    next()
  } catch (e) {
    log('error', `Unexpected token format: ${e}`)
    next('token not found')
  }
}


function downloadVod (requiredFields, entries, data, next) {
  log('info', 'Downloading vod data from Orange...')
  let uri = `${API_ROOT}/data/vod`
  if (requiredFields.remember.lastVideoStream) {
    uri += `?start=${requiredFields.remember.lastVideoStream.slice(0, 19)}`
  }
  requestOrange(uri, requiredFields.access_token, (err, body) => {
    if (err) { return next(err) }
    entries.videostreams = []
    if (body.forEach) body.forEach((vod) => {
      if (vod.ts && (!requiredFields.remember.lastVideoStream
        || requiredFields.remember.lastVideoStream < vod.ts)) {
        requiredFields.remember.lastVideoStream = vod.ts
      }

      if (vod.err) { return }

      entries.videostreams.push({
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
          adultLevel: vod.adult_level === 'none' ? undefined : vod.adult_level,
          csaCode: vod.csa_code
        },
        price: vod.price,
        timestamp: vod.ts,
        viewingDuration: vod.use_duration ? Math.round(Number(vod.use_duration) * 60) : undefined,
        details: {
          offer: vod.offer,
          offerName: vod.offer_name,
          service: vod.service,
          network: vod.net,
          techno: vod.techno,
          device: vod.device,
          platform: vod.platf
        },
        action: vod.action,  // visualisation or command
        clientId: vod.line_id
      })
    })
    next()
  })
}

// // // // //
// Helpers //

function requestOrange (uri, token, callback) {
  log('info', uri)

  request.get(uri, { auth: { bearer: token }, json: true }, (err, res, body) => {
    if (err) {
      log('error', `Download failed: ${err}`)
      return callback(err)
    }
    if (res.statusCode.toString() !== '200') {
      err = `${res.statusCode} - ${res.statusMessage} ${err || ''}`
      log('error', body)
    }

    callback(null, body)
  })
}


// function buildNotifContent (requiredFields, entries, data, next) {
//   // data.updated: we don't sepak about update, beacause we don't now if the
//   // update actually changes the data or not.

//   // Signal all add of document.
//   const addedList = []
//   Object.keys(data.created).forEach((docsName) => {
//     const count = data.created[docsName]
//     if (count > 0) {
//       addedList.push(localization.t(
//         `notification ${docsName}`, { smart_count: count }))
//     }
//   })

//   entries.notifContent = addedList.join(', ')
//   next()
// }
