export default {
    initialize(game) {
        this.game = game;

        this.player = this.game.player;
    },

    tp(x, y, z) {
        this.player.tpTo(x, y, z);
    }
}