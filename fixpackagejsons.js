const bolt = require('bolt');
const fse = require('fs-extra');
const fs = require('fs').promises;
const globby = require('globby');
const privateScopes = [
    '@af',
    '@repo',
    '@atlassian',
    '@atlassiansox'
]
const getScope = (depName) => depName.split('/')[0];
const isPrivateScope = (depName) => {
    const scope = getScope(depName);
    return privateScopes.includes(scope);
}
const isPrivateDep = (dep, workspaces) => {
    const scope = getScope(dep);

    if(isPrivateScope(dep)) {
        return true;
    }

    if (scope === '@atlaskit') {
        const depInfo = workspaces.find(ws => ws.name === dep);
        if(!depInfo || !depInfo.config) {
            console.error(`${dep} does not have an associated config, skipping`);
            return false;
        }
        return depInfo.config.private;
    }

    return false;
};

const filterDependencies = (dependencies = {}, workspaces) => {
    return Object.fromEntries(Object.entries(dependencies).filter(([name, versionString]) => !isPrivateDep(name, workspaces)))
};

const replacePrivateDependencies = (dependencies = {}, mapping, workspaces) => {
    return Object.fromEntries(Object.entries(dependencies).filter(([name]) => !isPrivateScope(name) || (isPrivateScope(name) && mapping[name]) ).map(([name, versionString]) => {
        if (mapping[name]) {
            return [ mapping[name], versionString ];
        }
        return [name, versionString];
    }))
}
const buildPrivatePackageNameMapping = async () => {
    const workspaces = await bolt.getWorkspaces();
    const scopeCounters = [];
    const mapping = Object.fromEntries(workspaces.filter(ws => isPrivateDep(ws.name, workspaces)).map(ws => {
        const scope = getScope(ws.name);
        if (!scopeCounters[scope]) {
            scopeCounters[scope] = 0;
        }
        const count = scopeCounters[scope] += 1;
        return [ws.name, `${scope}/package-${count}`];
    }));
    return mapping;
}

const main = async() => {
    const map = await buildPrivatePackageNameMapping();
    const workspaces = await bolt.getWorkspaces()
    
    await Promise.all(workspaces.map(async (ws) => {
        let changedPackageName = false;
        ws.config.dependencies = replacePrivateDependencies(ws.config.dependencies, map, workspaces);
        ws.config.devDependencies = replacePrivateDependencies(ws.config.devDependencies, map, workspaces);
        ws.config.peerDependencies = replacePrivateDependencies(ws.config.peerDependencies, map, workspaces);
        delete ws.config.prettier;
        delete ws.config.description;
        delete ws.config.scripts;
        delete ws.config.atlassian;
        delete ws.config['af:services'];
        
        if (map[ws.config.name]) {
            ws.config.name = map[ws.config.name];
            changedPackageName = true
        }
        await fse.writeJSON(`${ws.dir}/package.json`, ws.config, { spaces: 2 });
        
        // const paths = await globby(['*'], { expandDirectories:true, gitignore:true, cwd: ws.dir })
        // console.log(paths);

        if(changedPackageName) {
            const newPath = ws.dir.split('/');
            newPath[newPath.length - 1] = ws.config.name.replace('@', '').replace('/', '-');
            await fs.rename(ws.dir, newPath.join('/'));
        }
        
    }));
    
    const rootJson = await fse.readJSON(`${process.cwd()}/package.json`); 
    
    rootJson.dependencies = replacePrivateDependencies(rootJson.dependencies, map, workspaces);
    rootJson.devDependencies = replacePrivateDependencies(rootJson.devDependencies, map, workspaces);
    rootJson.peerDependencies = replacePrivateDependencies(rootJson.peerDependencies, map, workspaces);
    rootJson.workspaces = rootJson.bolt.workspaces;
    delete rootJson.prettier;
    delete rootJson.scripts;
    await fse.writeJSON(`${process.cwd()}/package.json`, rootJson, { spaces: 2 });
}

main();
