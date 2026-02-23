const axios = require('axios');
const url = 'https://api.cnyes.com/media/api/v1/newslist/category/tw_stock?page=1&limit=5';
axios.get(url).then(res => {
    console.log(JSON.stringify(res.data.items.data[0], null, 2));
}).catch(e => console.error(e));
