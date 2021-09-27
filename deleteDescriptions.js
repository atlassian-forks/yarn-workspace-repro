const bolt = require('bolt');
const fse = require('fs-extra');

const main = async() => {
    const workspaces = await bolt.getWorkspaces()
    
    await Promise.all(workspaces.map(async (ws) => {
        delete ws.config.description;
        delete ws.config.scripts;
        delete ws.config.atlassian;
        delete ws.config['af:services'];
        await fse.writeJSON(`${ws.dir}/package.json`, ws.config, { spaces: 2 });
    }));
    
}

main();
