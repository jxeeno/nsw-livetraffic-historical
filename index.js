const github = require('@actions/github');
const axios = require('axios');

const LIVE_TRAFFIC_ENDPOINTS = {
    'incident': 'https://www.livetraffic.com/traffic/hazards/incident.json',
    'roadwork': 'https://www.livetraffic.com/traffic/hazards/roadwork.json',
    'majorevent': 'https://www.livetraffic.com/traffic/hazards/majorevent.json',
    'fire': 'https://www.livetraffic.com/traffic/hazards/fire.json',
    'flood': 'https://www.livetraffic.com/traffic/hazards/flood.json',
    'alpine': 'https://www.livetraffic.com/traffic/hazards/alpine.json'
}
const toBase64 = (str) => {
    return Buffer.from(str || '').toString('base64');
}
const cleanGeometries = (features) => {
    return features.map(feature => {
        return {
            ...feature,
            geometry: {
                ...feature.geometry,
                type: (feature.geometry.type === "POINT" ? 'Point' : feature.geometry.type)
            }
        }
    });
}

const branch = 'data';

const COMMON_CREATE_OR_UPDATE_FILE = {
    owner: 'jxeeno',
    repo: 'nsw-livetraffic-historical',
    author: {
        name: 'jxeeno',
        email: 'me+nswlivetraffic@jxeeno.com'
    }
}

async function run() {
    const repoToken = process.env.GITHUB_TOKEN;
    const octokit = new github.GitHub(repoToken);

    const updateFile = async (path, input) => {
        let sha;
        let existingContent;
        try{
            const contents = await octokit.repos.getContents({
                ...COMMON_CREATE_OR_UPDATE_FILE,
                author: undefined,
                path,
                ref: branch
            });

            if(contents && contents.data && contents.data.sha){
                sha = contents.data.sha;
                existingContent = contents.data.content;
            }
        }catch(e){
            console.warn('error thrown when fetching contents of '+path);
        }
        const content = toBase64(input);

        if(content === existingContent){
            console.warn('no change found for '+path)
            return
        }

        await octokit.repos.createOrUpdateFile({
            ...COMMON_CREATE_OR_UPDATE_FILE,
            path,
            message: `auto(): update ${path}`,
            content,
            sha,
            branch
        });
    }

    for(const filename in LIVE_TRAFFIC_ENDPOINTS){
        const { data } = await axios.get(LIVE_TRAFFIC_ENDPOINTS[filename]);
        const {type, features} = data;
        try{
            await updateFile(
                `data/${filename}.geojson`,
                JSON.stringify({
                    type,
                    features: cleanGeometries(features)
                }, null, 2)
            );
            console.log(`Saved ${filename}`);
        }catch(e){
            console.error(`Error saving ${filename}`);
            console.error(e);
        }
    }
}
 
run();