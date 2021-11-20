const github = require('@actions/github');
const axios = require('axios');
const nodePath = require('path');

const LIVE_TRAFFIC_ENDPOINTS = {
    'incident': 'https://api.transport.nsw.gov.au/v1/live/hazards/incident/all',
    'roadwork': 'https://api.transport.nsw.gov.au/v1/live/hazards/roadwork/all',
    'majorevent': 'https://api.transport.nsw.gov.au/v1/live/hazards/majorevent/all',
    'fire': 'https://api.transport.nsw.gov.au/v1/live/hazards/fire/all',
    'flood': 'https://api.transport.nsw.gov.au/v1/live/hazards/flood/all',
    'alpine': 'https://api.transport.nsw.gov.au/v1/live/hazards/alpine/all'
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
    const tfnswApiKey = process.env.TFNSW_API_KEY;
    const octokit = github.getOctokit(repoToken);

    const updateFile = async (path, input) => {
        let sha;
        let existingInput;

        let parentDir = nodePath.join(path, '..')
        let filePath = nodePath.join(path)
        let files;
        // list dir
        try{
            files = await octokit.rest.repos.getContent({
                ...COMMON_CREATE_OR_UPDATE_FILE,
                author: undefined,
                path: parentDir,
                ref: branch
            });
        }catch(e){
            console.error('Could not list parent dir');
        }

        if(!files ||!files.data){
            console.error('GitHub did not return any files');
            return;
        }

        const file = files.data.find(f => f.path === filePath);
        
        if(!file){
            console.error('Could not find file '+filePath);
            return;
        }

        try{
            const contents = await octokit.rest.git.getBlob({
                ...COMMON_CREATE_OR_UPDATE_FILE,
                author: undefined,
                file_sha: file.sha
            });

            if(contents && contents.data && contents.data.sha){
                sha = file.sha;
                existingInput = Buffer.from(contents.data.content, "base64").toString();
            }

            // console.log(contents)
        }catch(e){
            console.warn('error thrown when fetching contents of '+path);
            console.error(e)
        }

        const content = toBase64(input);

        if(input === existingInput){
            console.warn('no change found for '+path)
            return
        }

        await octokit.rest.repos.createOrUpdateFileContents({
            ...COMMON_CREATE_OR_UPDATE_FILE,
            path,
            message: `auto(): update ${path}`,
            content,
            sha,
            branch
        });
    }

    for(const filename in LIVE_TRAFFIC_ENDPOINTS){
        const { data } = await axios.get(LIVE_TRAFFIC_ENDPOINTS[filename], {
            headers: {
                Authorization: `apikey ${tfnswApiKey}`
            }
        });
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