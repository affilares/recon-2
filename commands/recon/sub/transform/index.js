exports.yargs = {
    command: 'transform <transform>',
    describe: 'Perform inline transformation',
    aliases: ['t'],

    builder: (yargs) => {
        const { installReadOptions, installWriteOptions, handleReadOptions, handleWriteOptions } = require('../../lib/handlers/file')

        installReadOptions(yargs)
        installWriteOptions(yargs)

        const { getPreferencesSync } = require('@pown/preferences')

        const { remotes = {} } = getPreferencesSync('recon')

        const { buildRemoteTransforms } = require('../../../../lib/remote')

        const remoteTransforms = buildRemoteTransforms(remotes)

        const transforms = require('../../../../lib/transforms')

        const auto = {
            aliases: ['a'],

            description: 'Select the most appropriate methods of transformation',

            options: {
                name: {
                    description: 'Select only name matching transforms',
                    default: ''
                },

                alias: {
                    description: 'Select only alias matching transforms',
                    default: ''
                },

                title: {
                    description: 'Select only title matching transforms',
                    default: ''
                },

                tag: {
                    description: 'Select only alias matching transforms',
                    default: ''
                }
            },

            noise: 0
        }

        const compoundTransforms = { ...transforms, ...remoteTransforms }

        Object.entries({ ...compoundTransforms, auto }).forEach(([transformName, transform]) => {
            yargs.command({
                command: `${transformName.toLowerCase()} [options] <nodes...>`,
                aliases: transform.alias,
                describe: transform.description,

                builder: (yargs) => {
                    const { installOutputOptions } = require('../../lib/handlers/output')

                    installOutputOptions(yargs)

                    yargs.options('timeout', {
                        alias: 'T',
                        type: 'number',
                        describe: 'Timeout transforms',
                        default: 0
                    })

                    yargs.options('select', {
                        alias: 's',
                        type: 'boolean',
                        describe: 'Select graph',
                        default: false
                    })

                    yargs.options('traverse', {
                        alias: 'v',
                        type: 'boolean',
                        describe: 'Traverse graph',
                        default: false
                    })

                    yargs.options('noise', {
                        alias: 'n',
                        type: 'number',
                        describe: 'Maximum noise level',
                        default: 10
                    })

                    yargs.options('group', {
                        alias: 'g',
                        type: 'string',
                        describe: 'Group nodes',
                        default: ''
                    })

                    yargs.options('auto-group', {
                        alias: 'a',
                        type: 'boolean',
                        describe: 'Auto group nodes',
                        default: false
                    })

                    yargs.options('auto-weight', {
                        alias: 't',
                        type: 'boolean',
                        describe: 'Auto weight nodes',
                        default: false
                    })

                    yargs.option('max-nodes-warn', {
                        type: 'number',
                        describe: 'Warn when more than allowed nodes are to be inserted',
                        default: 200
                    })

                    yargs.option('max-nodes-cap', {
                        type: 'number',
                        describe: 'Warn when more than allowed nodes are to be inserted',
                        default: Infinity
                    })

                    yargs.options('extract', {
                        alias: 'e',
                        type: 'string',
                        describe: 'Extract fields'
                    })

                    yargs.option('extract-prefix', {
                        type: 'string',
                        describe: 'Prefix after extraction',
                        default: ''
                    })

                    yargs.option('extract-suffix', {
                        type: 'string',
                        describe: 'Suffix after extraction',
                        default: ''
                    })

                    yargs.option('node-type', {
                        type: 'string',
                        describe: 'The type for new nodes from the command line',
                        default: 'string'
                    })

                    Object.entries(transform.options).forEach(([optionName, option]) => {
                        optionName = optionName.replace(/([A-Z])/g, '-$1').replace(/^-+/, '').toLowerCase()

                        yargs.option(optionName, {
                            ...option,

                            describe: option.description
                        })
                    })
                },

                handler: async(argv) => {
                    const { timeout, select, traverse, noise, group, autoGroup, autoWeight, maxNodesWarn, maxNodesCap, extract, extractPrefix, extractSuffix, nodeType, nodes, ...rest } = argv

                    const { recon } = require('../../lib/globals/recon')

                    let filter = {
                        noise
                    }

                    if (transformName === 'auto') {
                        const { name, alias, title, tag } = argv

                        const regexify = (input) => {
                            if (input.startsWith('!')) {
                                input = input.slice(1).replace(/\*|%/g, '.*')

                                const regex = new RegExp(`^(?:${input})$`, 'i')

                                regex.test = (function(test) {
                                    return function(input) {
                                        return !test.call(this, input)
                                    }
                                })(regex.test)

                                return regex
                            }
                            else {
                                input = input.replace(/\*|%/g, '.*')

                                const regex = new RegExp(`^(?:${input})$`, 'i')

                                return regex
                            }
                        }

                        filter = {
                            ...filter,

                            name: name ? regexify(name) : undefined,
                            alias: alias ? regexify(alias) : undefined,
                            title: title ? regexify(title) : undefined,
                            tag: tag ? regexify(tag) : undefined
                        }

                        Object.entries(compoundTransforms).forEach(([name, transform]) => {
                            recon.registerTransforms({
                                [name]: transform.load()
                            })
                        })
                    }
                    else {
                        recon.registerTransforms({
                            [transformName]: transform.load()
                        })
                    }

                    await handleReadOptions(argv, recon)

                    const options = {}

                    Object.keys(transform.options).forEach((optionName) => {
                        options[optionName] = rest[optionName]
                    })

                    if (select) {
                        recon.select(...nodes)
                    }
                    else
                    if (traverse) {
                        recon.traverse(...nodes)
                    }
                    else {
                        const { makeId } = require('../../../../lib/utils')

                        recon.addNodes(nodes.map((node) => ({
                            id: makeId(nodeType, node),
                            type: nodeType,
                            label: node,
                            props: {
                                [nodeType]: node
                            },
                            edges: []
                        })))
                    }

                    try {
                        await recon.transform(transformName === 'auto' ? '*' : transformName, options, { timeout, group: autoGroup, weight: autoWeight, maxNodesWarn, maxNodesCap, filter, extract: { property: extract, prefix: extractPrefix, suffix: extractSuffix } })
                    }
                    catch (e) {
                        console.error(e)
                    }

                    if (group) {
                        recon.group(group)
                    }

                    const resultNodes = recon.selection.map(node => node.data())

                    await handleWriteOptions(argv, recon)

                    const { handleOutputOptions } = require('../../lib/handlers/output')

                    await handleOutputOptions(argv, resultNodes)
                }
            })
        })
    },

    handler: (argv) => {
        argv.context.yargs.showHelp()
    }
}