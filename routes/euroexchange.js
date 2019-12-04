let express = require('express');
let request = require('request');
let convert = require('xml-js');
let redis = require('redis');

let router = express.Router();
let redis_client = redis.createClient();

/////////////////// redis ///////////////////
redis_client.on("error", function (err) {
  console.log("Redis Error " + err);
});

/* GET users listing. */
router.get('/', function (req, res, next) {
  
  let src_currency = 'EUR';//req.query.src_currency;
  let src_amount = req.query.src_amount;
  let dest_currency = req.query.dest_currency;
  let dest_amount;

  console.log('query: ' + src_currency + ' ' + src_amount + ' ' + dest_currency);  

  if (isNaN(src_amount)){
    res.end('src is not a number');
  }
  
  let cache_key = 'euroexchange';
  redis_client.get(cache_key, function(err, reply){
    if (reply){
      console.log('cached');
      let resultObj = JSON.parse(reply);

      for (let i = 0; i < resultObj["gesmes:Envelope"].Cube.Cube.Cube.length; i++) {
        let currency = resultObj["gesmes:Envelope"].Cube.Cube.Cube[i]._attributes.currency;
        let rate = resultObj["gesmes:Envelope"].Cube.Cube.Cube[i]._attributes.rate;

        if (currency == dest_currency) {
          if (!isNaN(rate)) {
            dest_amount = parseFloat(src_amount) * parseFloat(rate);
            break;
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'text/json;charset=utf-8' });
      let result_dest = `{ result: true, src_currency: ${src_currency}, src_amount: ${src_amount}, dest_currency: ${dest_currency}, dest_amount: ${dest_amount} }`;
      res.end(result_dest);
    } else {
      console.log('not cached');
      let api_url = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml?8f0cfb589f3a48dc0d33801ac7c3bc83';
      request.get(api_url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
          var result = convert.xml2json(body, { compact: true, spaces: 4 });
          let resultObj = JSON.parse(result);

          redis_client.set(cache_key, result);
          redis_client.expire(cache_key, 10);

          for (let i = 0; i < resultObj["gesmes:Envelope"].Cube.Cube.Cube.length; i++) {
            let currency = resultObj["gesmes:Envelope"].Cube.Cube.Cube[i]._attributes.currency;
            let rate = resultObj["gesmes:Envelope"].Cube.Cube.Cube[i]._attributes.rate;

            if (currency == dest_currency) {
              if (!isNaN(rate)) {
                dest_amount = parseFloat(src_amount) * parseFloat(rate);
                break;
              }
            }
          }
          res.writeHead(200, { 'Content-Type': 'text/json;charset=utf-8' });
          let result_dest = `{ result: true, src_currency: ${src_currency}, src_amount: ${src_amount}, dest_currency: ${dest_currency}, dest_amount: ${dest_amount} }`;
          res.end(result_dest);
        } else {
          res.status(response.statusCode).end();
          console.log('request error = ' + response.statusCode);
        }
      });
    }
  });

  
});

module.exports = router;
