// @ts-nocheck
const puppeteer = require("puppeteer");
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const axios = require('axios');
const url = require('url');
const winston = require('winston');
const fs = require('fs').promises;
const request = require('request');

const current_time_in_seconds = Math.floor(Date.now() / 1000);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`+(info.splat!==undefined?`${info.splat}`:" "))
  ),
  transports: [
    new winston.transports.File({ filename: 'bruht.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`+(info.splat!==undefined?`${info.splat}`:" "))
    ),
    level: 'debug'
  }));
}
if(process.env.debugging == 'true'){
  logger.add(new winston.transports.File({
    filename: 'error.log',
    level: 'debug',
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`+(info.splat!==undefined?`${info.splat}`:" "))
    )
  }));
}

//IG POSTING
let ig_app_id = process.env.IG_APP_ID //you find this in https://developers.facebook.com/apps/YOUR_IG_APP_ID/rate-limit-details/app/?business_id=YOUR_BUSINESS_ID
let ig_app_secret = process.env.IG_APP_SECRET
let ig_id = process.env.IG_BUSINESS_ID
let fb_id = process.env.FB_PAGE_ID
let ig_one_hour_access_token = process.env.IG_ONE_HOUR_ACCESS_TOKEN
let ig_access_token = process.env.IG_ACCESS_TOKEN

const start_endpoint = "https://graph.facebook.com"
let api_version = "v17.0"
let endpoint = `${start_endpoint}/${api_version}/${ig_id}/media`;
let pub_endpoint = `${start_endpoint}/${ig_id}/media_publish`;
let img_spam = process.env.SPAM_IMAGE //has to be static
let spamText = process.env.SPAM_TEXT
let tags = process.env.TAGS

//TG STUFF
const adminChatId = process.env.TG_ADMIN_GROUP_ID;
const channelChatId = process.env.TG_BRUHT_CHANNEL_CHATID;
const token = process.env.TG_TOKEN;
const rapidApiKey = process.env.RAPID_API_KEY;
const bot = new TelegramBot(token, {polling: true});
const IdPinnedMessage = process.env.TG_ID_PINNED_MESSAGE;

function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

const startingTime = Date.now()/1000  //format https://www.unixtimestamp.com/ 

const memerList = {
  //user.from.id  //nick
  [process.env.MEMER_USER_ID_1]: process.env.MEMER_NAME_1,
  [process.env.MEMER_USER_ID_2]: process.env.MEMER_NAME_2,
  [process.env.MEMER_USER_ID_3]: process.env.MEMER_NAME_3,
};

//---------- PINNED MESSAGE ----------

async function updatePinnedMessage() {
  let req_IGP = await how_many_posts_do_i_have_left(ig_id, ig_access_token) 
  let req_IGD = 350

  let updatedMessage = `IG Download: ${req_IGD} || IG Posting: ${req_IGP}`;

  try{
    bot.editMessageText(updatedMessage, {
      chat_id: adminChatId,
      message_id: IdPinnedMessage,
    });
  } catch {}
  
}
setInterval(updatePinnedMessage, 3600*1000);

//--------------- RULES ---------------

bot.onText(/\/help(@\w+)?/, (msg) => {
  const chatId = msg.chat.id;
  if(msg.date-startingTime>0){
    if(chatId == adminChatId){
      bot.sendMessage(chatId, `
Ogni singolo file video/foto/link che verrà mandato qui verrà mandato anche sul canale @bruht 
        
Per inviare post multipli o storie da Instagram basta aggiungere prima del link il numero corrispondete alla posizione della storia/post che si vuole inviare.
Esempio: voglio inviare il 3° post/storia?
=> Scrivo "3https://www​.instagram.​com/..."
    
In caso si dimenticasse di mettere il numero davanti al link, il bot prenderebbe automaticamente il 1° post o la prima storia`);
    } else {
      bot.sendMessage(chatId, `
Ogni singolo file video/foto/link che verrà mandato qui verrà automaticamente scaricato dopo il messaggio "Wait..." 
        
Per inviare post multipli o storie da Instagram basta aggiungere prima del link il numero corrispondete alla posizione della storia/post che si vuole inviare.
Esempio: voglio inviare il 3° post/storia?
=> Scrivo "3https://www​.instagram.​com/..."
    
In caso si dimenticasse di mettere il numero davanti al link, il bot prenderebbe automaticamente il 1° post o la prima storia`)
    }
  }
})

//----------- MEDIA FORWARD -----------

async function forwardMedia(msg, memer){

  let fileId, file, fileUrl;
  const mLink = msg.message_id;

  if (msg.photo) {

    fileId = msg.photo[msg.photo.length - 1].file_id;
    file = await bot.getFile(fileId);
    fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    
    await post_on_ig(fileUrl, '~ '+memer)
    bot.sendPhoto(channelChatId, fileId, {caption: '~ '+memer}).then(() => {
      bot.deleteMessage(adminChatId, mLink)
    })

  } else if (msg.video) {

    fileId = msg.video.file_id;
    file = await bot.getFile(fileId);
    fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    
    await post_on_ig(fileUrl, '~ '+memer)
    bot.sendVideo(channelChatId, fileId, {caption: '~ '+memer}).then(() => {
      bot.deleteMessage(adminChatId, mLink)
    })

  } else if (msg.animation) {
    fileId = msg.animation.file_id;
    file = await bot.getFile(fileId);
    fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    
    await post_on_ig(fileUrl, '~ '+memer)
    bot.sendAnimation(channelChatId, fileId, {caption: '~ '+memer}).then(() => {
      bot.deleteMessage(adminChatId, mLink)
    })
  } else if (msg.media_group_id) {

    const mediaGroup = await bot.getMediaGroup(msg.chat.id, msg.media_group_id);

    for (let msg of mediaGroup) {
      fileId = msg.animation.file_id;
      file = await bot.getFile(fileId);
      fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

      await post_on_ig(fileUrl, '~ '+memer)
    }

  }
  logger.debug(fileUrl)
}

bot.on('message', (msg) => {

  if(msg.date-startingTime>0){

    const chatId = msg.chat.id;
    const sender = msg.from.id;
    let memer = memerList[sender]

    logger.debug(chatId)

    if ((msg.photo || msg.video || msg.animation || msg.media_group_id) && chatId==adminChatId) {
      forwardMedia(msg, memer)
    }
  }
});

//------- GET INFO DATASTREAM --------

async function getFileDetailsTelegramMediaForward(url) {
  const urlParts = url.split('/');
  const typeIndex = urlParts.indexOf('photos') !== -1 ? urlParts.indexOf('photos') : urlParts.indexOf('videos');
  if (typeIndex !== -1) {
    return urlParts[typeIndex];
  }
  return null;
}

async function getFileDetails(url) {
  try {

    //IG API doesn't have the type of media so we'll use this
    if(url.startsWith('https://smvd-videos') == true || url.startsWith('https://scontent') == true || url.startsWith('https://instagram') == true){
      return 'video';
    }
    const response = await axios.get(url);
    
    const content_type_and_extension = response.headers['content-type'];
    const content_type_and_extension_partitions = content_type_and_extension.split('/');
    const content_type = content_type_and_extension_partitions[0];
    logger.log({content_type_and_extension_partitions, content_type_and_extension, content_type});
    logger.debug(content_type)
    return content_type;

  } catch (error) {
    logger.error('Errore durante la richiesta HTTP GET:', error.message);
    return null;
  }
}

//------- UPDATE TOKEN COMMAND -------

bot.onText(/\/update_token\s+[\w\d\W]+/, (msg) => {
  const chatId = msg.chat.id;
  if(msg.date-startingTime>0){
    if(chatId == adminChatId){
      logger.debug(msg.text)
      let token = msg.text.replace("/update_token ", "")
      logger.debug(token)
      get_long_lived_access_token(token).then(() => {
        bot.sendMessage(chatId, 'token updated successfully!');
      })
    }
  }
})

bot.onText(/\/delete_queue(@\w+)?/, (msg) => {
  const chatId = msg.chat.id;
  if(msg.date-startingTime>0){
    if(chatId == adminChatId){
      clear_file('container.txt')
      .then(() => {
        bot.sendMessage(chatId, `Queue Deleted successfully!`);
      })
    }
  }
})

// ====================================================== IG POSTING PHASE ========================================================

async function update_env_file(full_var_name, new_value){  //full_var_name must be a string

  try{
    let var_name = full_var_name.split('.').pop();
    let env_content = await fs.readFile('.env', 'utf-8');

    let regex = new RegExp(`^${var_name} = .*`, 'gm');
    let updated_env_content = env_content.replace(regex, `${var_name} = ${new_value}`);

    await fs.writeFile('.env', updated_env_content);
    //qua devi aggiornare process.env.IG_ACCESS_TOKEN, non full_var_name
    process.env[var_name] = new_value;
    logger.debug("LONG LIVED ACCESS TOKEN UPDATED SUCCESSFULLY! Token: " + process.env[var_name]);
  } catch (error) {
    logger.debug("Error while updating the .env file: " +error)
  }
}

async function get_long_lived_access_token(ig_one_hour_access_token) {
  let my_endpoint = `${start_endpoint}/${api_version}/oauth/access_token?grant_type=fb_exchange_token&client_id=${ig_app_id}&client_secret=${ig_app_secret}&fb_exchange_token=${ig_one_hour_access_token}`;
  
  try {
    let response = await axios.get(my_endpoint);
    const new_ig_access_token = response.data.access_token;
    const token_life = response.data.expires_in;
    const expiring_date = current_time_in_seconds + token_life;
    logger.debug(expiring_date);
    logger.debug({new_ig_access_token, expiring_date});

    await update_env_file('process.env.IG_ACCESS_TOKEN', new_ig_access_token);
    logger.debug('".env" File Updated.');

    await clear_file('IG_AccessTokenExpirationDate.txt');
    await fs.appendFile('IG_AccessTokenExpirationDate.txt', String(expiring_date));
    logger.debug('"IG_AccessTokenExpirationDate.txt" Updated.');

    return;

  } catch (error) {
    if (error.response) {
      logger.error(`Response error: ${error.response.status} - ${error.response.statusText}`);
    } else if (error.request) {
      logger.error('No response received from the server.');
    } else {
      logger.error(`Error: ${error.message}`);
    }
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function find_instagram_business_id(fb_id, ig_access_token){
  let my_endpoint = `${start_endpoint}/${api_version}/${fb_id}?fields=instagram_business_account&access_token=${ig_access_token}`
  try{
    let response = await axios.get(my_endpoint)
    const ig_business_id = response.data.instagram_business_account.id;
    logger.debug(ig_business_id)
    return ig_business_id;
  
  }catch(error) {
    logger.error(error);
  };
}

async function how_many_posts_do_i_have_left(ig_id, ig_access_token) {
  let my_endpoint = `${start_endpoint}/${api_version}/${ig_id}/content_publishing_limit?fields=quota_usage,config&access_token=${ig_access_token}`;
  try{
    let response = await axios.get(my_endpoint)
    let quota_usage = response.data.data[0].quota_usage;
    let quota_total = response.data.data[0].config.quota_total;
    let quota_left = quota_total - quota_usage - 1;
    return quota_left;
  } catch (error){
    logger.error(error);
  };
}

async function image_container_request(file_link, caption) {

  try{
    let response  = await axios.post(endpoint, null, {
      params: {
        image_url: file_link,
        is_carousel_item: true,
        caption: caption,
        location_id: null,
        user_tags: null,
        product_tags: null,
        access_token: ig_access_token,
      },
    });
    const creation_id = response.data.id
    logger.debug(creation_id)
    return creation_id

  } catch (error) {
    logger.error('Error:', error.message);
  }
}

async function reel_container_request(file_link, caption) {

  try {
    let response = await axios.post(endpoint, null, {
      params: {
        media_type: 'REELS',
        video_url: file_link,
        caption: caption,
        cover_url: null,
        audio_name: null,
        user_tags: null,
        location_id: null,
        thumb_offset: null,
        share_to_feed: true,
        access_token: ig_access_token,
      },
    });
    
    logger.debug("creation_id: "+response.data.id)
    const creation_id = String(response.data.id)
    return creation_id
  
  } catch (error) {
    logger.error('Error:'+ error.message);
  }
}

async function carousel_container_request(caption, container_ids) {

  try {
    let response  = await axios.post(endpoint, null, {
      params: {
        media_type: 'CAROUSEL',
        caption: caption,
        location_id: null,
        product_tags: null,
        children: container_ids,
        access_token: ig_access_token,
      },
    });
    
    const creation_id = response.data.id
    logger.debug(creation_id)
    return creation_id
  
  } catch (error) {
    logger.error('Error:', error.message);
  }
}

async function check_if_container_is_created(ig_container_id){
  let my_endpoint = `${start_endpoint}/${api_version}/${ig_container_id}?fields=status_code&access_token=${ig_access_token}`;

  try {
    let response;
    do {
      await sleep(10000); // It depends from the size of the file, 10 works for basically everything
      response = await axios.get(my_endpoint);
    } while (response.data.status_code !== 'FINISHED');

    logger.debug(response.data.status_code);
    return true;
  } catch (error) {
    logger.error(error);
    return false; // Return false on error or if the status code is not FINISHED
  }
}

async function IG_upload(creation_id) {
  try {
    await axios.post(pub_endpoint, null, {
      params: {
        creation_id: creation_id,
        access_token: ig_access_token
      },
    });
    
  } catch (error) {
    logger.error('Error:', error.message);
  }
}

async function add_to_list(container_id) {

  const newLine = container_id;

  try{
    fs.appendFile('container.txt', newLine + '\n');
    logger.debug('Added');
  } catch (error){
      logger.error(`Error while appending container '${container_id}' to container.txt: `, err);
  };
}

async function count_container_ids(textfile) {
  try {
    const data = await fs.readFile(textfile, 'utf8');
    const n_lines = data.trim().split('\n');
    return n_lines.length;
  } catch (err) {
    logger.error("Error while reading '"+textfile+"': ", err);
    throw err;
  }
}

async function get_container_ids() {
  try {
    let data = await fs.readFile('container.txt', 'utf8');
    let lines = data.trim().split('\n');
    
    let containerIds = [];

    for (let line of lines) {
      let containerId = line.trim();
      if (!isNaN(containerId)) {
        containerIds.push(containerId);
      }
    }

    return containerIds;
  } catch (err) {
    logger.error("Error while reading 'container.txt': ", err);
    throw err;
  }
}

async function clear_file(file) {
  try {
    // Riduci la dimensione del file a 0 per cancellare tutto il contenuto
    await fs.truncate(file, 0);
    logger.debug('Il file è stato svuotato con successo.');
  } catch (err) {
    logger.error('Si è verificato un errore durante la cancellazione del file:', err);
    throw err;
  }
}

async function post_on_ig(file_url, caption){
  let expiring_time = await fs.readFile('IG_AccessTokenExpirationDate.txt', 'utf-8');
  logger.debug(`expiring_time:           ${expiring_time}`);
  logger.debug(`current_time_in_seconds: ${current_time_in_seconds}`);

  //mancano 10 giorni alla scadenza del token, controlla su https://www.unixtimestamp.com/ in caso
  if(current_time_in_seconds > expiring_time-(864000)){   
    //manda messaggio su telegram per avvisare della scadenza
    logger.debug(`it's almost time to update ig_one_hour_access_token and create ig_access_token using the following command: @update_token + <NEW 1H ACCESS TOKEN>`);
    logger.debug("sent the reminder to update the token")
  }

  let file_type = await getFileDetails(file_url) // video or image
  logger.debug(file_type)
  if(file_type === 'application'){
    
    let actual_file_type = await getFileDetailsTelegramMediaForward(file_url);
    if(actual_file_type === 'photos'){
      file_type = 'image';
    } else if(actual_file_type === 'videos' || actual_file_type === 'animations'){
      file_type = 'video';
    }
  }

  if (file_type === 'video'){


    logger.debug('ao')
    let container_id = await reel_container_request(file_url, caption)
    logger.debug("container_id:"+container_id)

    let is_created = await check_if_container_is_created(container_id)
    logger.debug("is_creted:"+is_created)

    if (is_created){
      await IG_upload(container_id)

      let left = await how_many_posts_do_i_have_left(ig_id, ig_access_token)
      logger.debug(`You have ${left} post/reels left for today`);
      
      return;
    } else {
      logger.debug('Errore durante la pubblicazione')
      return;
    }


  } else if (file_type === 'image') {



    let container_count = await count_container_ids('container.txt')
    if (container_count<0 || container_count>9){
      logger.debug("error: the elements inside 'container.txt' are too many")
      return;
    }

    let new_img_container = await image_container_request(file_url, caption)
    logger.debug("new_image_container: " + new_img_container)
    
    if(new_img_container != undefined){
      await add_to_list(new_img_container);
      logger.debug('Added');
    } else {
      logger.debug('Unfortunatly Image Conatiner == undefined, try again!');
      return;
    }

    container_count = await count_container_ids('container.txt')
    logger.debug("container_count: "+container_count)

    if(container_count === 9){

      //adding spam image at the end of 'container.txt', now there are 10 images
      let spam_container = await image_container_request(img_spam, '')
      logger.debug(spam_container)
      await add_to_list(spam_container)
      
      let container_ids = await get_container_ids();
      let container_id = await carousel_container_request(caption, container_ids)
      logger.debug("container_id: " + container_id)

      let is_created = await check_if_container_is_created(container_id)
      logger.debug("is_created: " + is_created)
      if (is_created){
        await clear_file('container.txt')
        await IG_upload(container_id)
        logger.debug("uploaded")
        let left = await how_many_posts_do_i_have_left(ig_id, ig_access_token)
        logger.debug(`You have ${left} post/reels left for the next 24h`)
        return;
      } else {
        logger.debug('Errore durante la pubblicazione')
        return;
      }
    } else {
      return;
    }
  } else {
    logger.debug('invalid file_type: ' + file_type)
    return;
  }
}
//await post_on_ig(img_spam, 'BACK INTO THE GAME')

// ========================================================= SCRAPING PHASE =========================================================

//---------------- YT ----------------

async function getFileSize(url) {
  try {
    const response = await axios.head(url);
    const contentLength = response.headers['content-length'];
    if (contentLength) {
      const fileSizeInBytes = parseInt(contentLength, 10);
      const fileSizeInMB = fileSizeInBytes / (1024 * 1024);
      return fileSizeInMB;
    }
    return null;
  } catch (error) {
    logger.error('Error:', error.message);
    return null;
  }
}

async function get_YT_old(link){    //Deprecated
  try{
    const browser = await puppeteer.launch({
      headless: false,
      args: ["--start-maximized"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 0, height: 0, slowMo: 500  });

    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36";
    await page.setUserAgent(ua);

    await page.goto('https://yt5s.com/it142/youtube-to-mp4', {
      waitUntil: "networkidle0",
    });

    await page.waitForSelector("#s_input"); // wait for the input field to appear
    await page.evaluate((link) => {
      const input = document.querySelector("#s_input");
      if (input) {
        input.value = link;
      }
    }, await link);

    // Click the search button
    await page.waitForSelector("#search-form > button")
    await page.click("#search-form > button");
    
    //selects for maximum quality
    await page.waitForSelector('#formatSelect');
    await page.select('#formatSelect', 'mp4');
 
    await page.waitForSelector('/html/body/div/div[1]/div[2]/div/div/div/div/div/div[1]/button');
    await page.click('/html/body/div/div[1]/div[2]/div/div/div/div/div/div[1]/button');
    delay(4000)
    //gets link
    await page.waitForSelector('#asuccess');
    
    const general_links = await page.$$eval('a', as=>as.map(a=>a.href));
    logger.debug(general_links);
    const post_links = [];

    for (let i = 1; i <= general_links.length; i++) {
      if (general_links[i] instanceof String || typeof general_links[i] === 'string') {
        if ((general_links[i].startsWith("https://dt"))==true) {
          post_links.push(general_links[i]);
        }
      }
    }
    logger.debug(post_links);
    await browser.close();
    return post_links[0];

  } catch {} 
}

const getVideoId = (link) => {  //https://rapidapi.com/ytjar/api/ytstream-download-youtube-videos
  const parsedUrl = url.parse(link);
  const path = parsedUrl.pathname;
  const pathParts = path.split('/');
  let videoId = null;

  // Check if it's a shorts link
  if (pathParts[1] === 'shorts') {
    videoId = pathParts[2];
    logger.debug('è uno short videoid='+videoId)
  }

  // Check if it's a regular video link
  if (!videoId && pathParts[1] === 'watch') {
    const query = parsedUrl.query;
    const queryParams = new URLSearchParams(query);
    videoId = queryParams.get('v');
    logger.debug('ha watch all interno del link videoid='+videoId)
  }

  // Check if it's a youtu.be link
  if (!videoId && parsedUrl.hostname === 'youtu.be') {
    videoId = pathParts[1];
    logger.debug('ha youtu.be all interno del link videoid='+videoId)
  }

  return videoId;
};

async function get_YT(link){

  const videoId = getVideoId(link);
  logger.debug("video id =" +videoId);

  const options = {
    method: 'GET',
    url: 'https://ytstream-download-youtube-videos.p.rapidapi.com/dl',
    params: {id: videoId},
    headers: {
      'X-RapidAPI-Key': rapidApiKey,
      'X-RapidAPI-Host': 'ytstream-download-youtube-videos.p.rapidapi.com'
    }
  };

  try {
  	const response = await axios.request(options);
    
    let streamLink = "";
    try{
      streamLink = response.data.formats[2].url;
    } catch{}
    if (streamLink === ""){
      try{
        streamLink = response.data.formats[1].url; //for low quality videos
      }catch {}
    }
    logger.info("link yt dentro la funzione get: "+streamLink)

    return streamLink;
  } catch (error) {
  	logger.error(error);
  }
}

async function run_YT(rawLink, chatId, mLink) {  

  let link, cap="";
  const lastSpaceIndex = rawLink.lastIndexOf(' ');

  if (lastSpaceIndex !== -1) {
    link = rawLink.substring(lastSpaceIndex + 1);
    cap = rawLink.substring(0, lastSpaceIndex);
    logger.debug("cap:" + cap);
  } else {
    link = rawLink;
  }
  logger.debug("link:" + link);


  const downloadLink = await get_YT(link);
  const size = await getFileSize(downloadLink)

  logger.debug(size)
  logger.debug(downloadLink)
  logger.debug(memer)
  //saveVideo(downloadLink, '.\\videos\\prova.mp4')

  if(size > 20){
    try{
      await bot.sendMessage(chatId, 'File troppo pesante');
    } catch (error) {
      logger.error("error: " + error)
    }
  } else if (downloadLink == undefined){
    try{
      await bot.sendMessage(chatId, 'Link non tovato');
    } catch (error) {
      logger.error("error: " + error)
    }
  } else {
    try{
      logger.debug('dovrebbe inviare video');
      if(chatId == adminChatId){
        bot.sendVideo(channelChatId, downloadLink, {caption: `${cap}\n\n~ ${memer}`})
        logger.debug(`${cap}\n\n~ ${memer}\n\n\n${spamText}\n\n\n${tags}`)

        post_on_ig(downloadLink, `${cap}\n\n~ ${memer}\n\n\n${spamText}\n\n\n${tags}`)
        bot.deleteMessage(adminChatId, mLink);
      } else {
        bot.sendVideo(chatId, downloadLink);
      }
    } catch (error) {
      logger.error("error: " + error)
    }
  } 
  return;
}     

bot.onText(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/[^\s]+(?:\s.+)?$/, (msg) => {

  if(msg.date-startingTime>0){
  
    const mLink = msg.message_id;
    const chatId = msg.chat.id;
    const sender = msg.from.id;

    memer = memerList[sender]

    bot.sendMessage(chatId, "Wait...")
    .then((sentMessage) => {
      const messageId = sentMessage.message_id;
      logger.debug('message id dento ontext (verifica che non sia null):' + messageId)
      logger.debug('chat id, veifica non sia null: '+chatId)
      run_YT(msg.text, chatId, mLink)
      .then(() => {
        bot.deleteMessage(chatId, messageId);
      })
    })
    .catch((error) => {
      logger.error('Error:', error);
    });
  }
});

//---------------- IG ----------------

function isRetryableError(errorCode) {
  const retryableErrorCodes = [429, 500, 502, 503, 504];
  return retryableErrorCodes.includes(errorCode);
}

async function download_IG_API_1(ig_link) {
  try {
    const response = await axios.request({
      method: 'GET',
      url: 'https://social-media-video-downloader.p.rapidapi.com/api/getSocialVideo',
      params: {
        url: ig_link,
        filename: '',
      },
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'social-media-video-downloader.p.rapidapi.com'
      }
    });

    return { status: 'success', link: response.data.links[0].link };
  } catch (error) {
    return { status: 'error', errorCode: error.response ? error.response.status : undefined };
  }
}

async function download_IG_API_2(ig_link) {
  try {
    const response = await axios.request({
      method: 'GET',
      url: 'https://instagram-downloader-download-instagram-videos-stories.p.rapidapi.com/index',
      params: {
        url: ig_link,
      },
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'instagram-downloader-download-instagram-videos-stories.p.rapidapi.com',
      }
    });

    console.log(response.data)
    return { status: 'success', link: response.data.media };
  } catch (error) {
    return { status: 'error', errorCode: error.response ? error.response.status : undefined };
  }
}

async function download_IG_API_3(ig_link) {
  try {
    const response = await axios.request({
      method: 'GET',
      url: 'https://instagram-media-downloader.p.rapidapi.com/rapid/post.php',
      params: {
        url: ig_link,
      },
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'instagram-media-downloader.p.rapidapi.com'
      }
    });

    return { status: 'success', link: response.data.video };
  } catch (error) {
    return { status: 'error', errorCode: error.response ? error.response.status : undefined };
  }
}

async function download_IG(ig_link) {
  try {
    const result1 = await download_IG_API_1(ig_link);

    if (result1.status === 'success') {
      logger.debug('Download completato con successo:', result1.link);
      return result1.link;
    }

    if (result1.status === 'error' && isRetryableError(result1.errorCode)) {
      logger.debug('Errore durante il download con API 1. Riprova con API 2.');
      const result2 = await download_IG_API_2(ig_link);

      if (result2.status === 'success') {
        console.log(result2)
        logger.debug('Download completato con successo:', result2.link);
        return result2.link;
      }

      if (result2.status === 'error' && isRetryableError(result2.errorCode)) {
        logger.debug('Errore durante il download con API 2. Riprova con API 3.');
        const result3 = await download_IG_API_3(ig_link);

        if (result3.status === 'success') {
          logger.debug('Download completato con successo:', result3.link);
          return result3.link;
        }

        logger.error('Errore durante il download con API 3:', result3.errorCode);
      } else {
        logger.error('Errore durante il download con API 2:', result2.errorCode);
      }
    } else {
      logger.error('Errore durante il download con API 1:', result1.errorCode);
    }
  } catch (error) {
    logger.error('Errore imprevisto:', error);
  }
}
//download_IG('https://www.instagram.com/reel/...');


function downloadVideo(url, callback) {
  request(url, { encoding: null }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
          callback(null, body);
      } else {
          callback(error || new Error('Failed to download video'));
      }
  });
}

async function run_IG(linkandcap, chatId, mLink) {  
  
  let link, cap="";
  const lastSpaceIndex = linkandcap.lastIndexOf(' ');

  if (lastSpaceIndex !== -1) {
    link = linkandcap.substring(lastSpaceIndex + 1);
    cap = linkandcap.substring(0, lastSpaceIndex);
    logger.debug("cap:" + cap);
  } else {
    link = linkandcap;
  }

  logger.debug("final link:" + link);
  
  //getting the datastream url
  let downloadLink = await download_IG(link).catch(error => console.error(error));


  logger.debug('IG Datastream Url:', downloadLink);
  const size = await getFileSize(downloadLink) 

  if (downloadLink == undefined){
    bot.sendMessage(chatId, 'è undefineds');
  } 
  
  if(size > 20){
    try{
      await bot.sendMessage(chatId, 'File troppo pesante');
    } catch (error) {
      logger.error("error: " + error)
    }
  } else {

    if (chatId == adminChatId) {
      // Scarica il video dal data stream
      downloadVideo(downloadLink, (error, videoBuffer) => {
      if (error) {
        logger.error(error);
        return;
      }
      // Invia il video al chat specificato
      bot.sendVideo(channelChatId, videoBuffer, { caption: `${cap}\n\n~ ${memer}` })
        .then(() => {
          logger.debug(`${cap}\n\n~ ${memer}\n\n\n${spamText}\n\n\n${tags}`);
          post_on_ig(downloadLink, `${cap}\n\n~ ${memer}\n\n\n${spamText}\n\n\n${tags}`);
          bot.deleteMessage(adminChatId, mLink);
        })
        .catch((err) => {
          logger.error('Errore durante l\'invio del video:', err);
        });
      });
    } else {
      // Scarica il video dal data stream
      downloadVideo(downloadLink, (error, videoBuffer) => {
      if (error) {
        logger.error(error);
        return;
      }
      // Invia il video al chat specificato
      bot.sendVideo(chatId, videoBuffer)
        .catch((err) => {
            logger.error('Errore durante l\'invio del video:', err);
        });
      });
    }
  }
  return;
}

bot.onText(/https?:\/\/(www\.)?instagram\.com\/[\w\-]+\//i, (msg) => {
  
  if(msg.date-startingTime>0){

    const mLink = msg.message_id;
    const chatId = msg.chat.id;
    const sender = msg.from.id;

    memer = memerList[sender]

    bot.sendMessage(chatId, "Wait...")
    .then((sentMessage) => {
      const messageId = sentMessage.message_id;
      logger.debug('message id dento ontext (verifica che non sia null):' + messageId)
      logger.debug('chat id, veifica non sia null: '+chatId)
      run_IG(msg.text, chatId, mLink)
      .then(() => {
        bot.deleteMessage(chatId, messageId);
      })
    })
    .catch((error) => {
      logger.error('Error:', error);
    });
  }
});

//---------------- TT ----------------

async function get_TT(link) {
  
  const options = {
    method: 'GET',
    url: 'https://tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com/vid/index',
    params: {
      url: link
    },
    headers: {
      'X-RapidAPI-Key': rapidApiKey,
      'X-RapidAPI-Host': 'tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com'
    }
  };

  try {
  	const response = await axios.request(options);
  	const streamLink = response.data.video[0];
    logger.debug('download link dentro get: '+ streamLink)
    return streamLink;
  } catch (error) {
  	logger.error(error);
  }
}

async function run_TT(rawLink, chatId, mLink){

  let link, cap="";
  const lastSpaceIndex = rawLink.lastIndexOf(' ');

  if (lastSpaceIndex !== -1) {
    link = rawLink.substring(lastSpaceIndex + 1);
    cap = rawLink.substring(0, lastSpaceIndex);
    logger.debug("cap:" + cap);
  } else {
    link = rawLink;
  }
  logger.debug("link:" + link);


  const downloadLink = await get_TT(link);
 
  const size = await getFileSize(downloadLink) 

  logger.debug('download link dentro run: '+ downloadLink)

  if(size > 20){
    try{
      await bot.sendMessage(chatId, 'File troppo pesante');
    } catch (error) {
      logger.error("error: " + error)
    }
  } else if (downloadLink == undefined){
    bot.sendMessage(chatId, 'è undefined');
  } else {
    logger.debug('dovrebbe mandare video')

    if(chatId == adminChatId){
      bot.sendVideo(channelChatId, downloadLink, {caption: `${cap}\n\n~ ${memer}`})
      logger.debug(`${cap}\n\n~ ${memer}\n\n\n${spamText}\n\n\n${tags}`)

      post_on_ig(downloadLink, `${cap}\n\n~ ${memer}\n\n\n${spamText}\n\n\n${tags}`)
      bot.deleteMessage(adminChatId, mLink);
    } else {
      bot.sendVideo(chatId, downloadLink)
    }
  } 
  return;
}

bot.onText(/https?:\/\/(?:\w+\.)?tiktok\.com(\/[^\r\n]+)/, (msg) => {
   
  if(msg.date-startingTime>0){

    const mLink = msg.message_id
    const chatId = msg.chat.id;
    const sender = msg.from.id;

    memer = memerList[sender]
    
    bot.sendMessage(chatId, "Wait...")
    .then((sentMessage) => {
      const messageId = sentMessage.message_id;
      logger.debug('message id dento ontext (verifica che non sia null):' + messageId)
      logger.debug('chat id, veifica non sia null: '+chatId)
      run_TT(msg.text, chatId, mLink)
      .then(() => {
        bot.deleteMessage(chatId, messageId);
      })
    })
    .catch((error) => {
      logger.error('Error:', error);
    });
  }
});
