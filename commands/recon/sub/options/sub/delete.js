exports.yargs = {
    command: 'delete <name>',
    describe: 'Delete option',
    aliases: ['d'],

    builder: {},

    handler: async(argv) => {
        const { options } = require('../../../lib/globals/options')

        const { name } = argv

        await options.deleteOption(name)
    }
}