
#include "lexer.h"

char *DEFAULT_FILENAME = "<no file>";

void fus_lexer_init(fus_lexer_t *lexer, char *filename){
    lexer->chunk = NULL;
    lexer->chunk_size = 0;
    lexer->chunk_i = 0;

    lexer->filename = filename? filename: DEFAULT_FILENAME;
    lexer->pos = 0;
    lexer->row = 0;
    lexer->col = 0;

    lexer->token = NULL;
    lexer->token_len = 0;
    lexer->token_type = FUS_TOKEN_ERR;
}

void fus_lexer_reset(fus_lexer_t *lexer, char *filename){
    fus_lexer_cleanup(lexer);
    fus_lexer_init(lexer, filename);
}

void fus_lexer_cleanup(fus_lexer_t *lexer){
    if(lexer->filename != DEFAULT_FILENAME)free(lexer->filename);
}

void fus_lexer_load_chunk(fus_lexer_t *lexer,
    const char *chunk, size_t chunk_size
){
    if(lexer->token_type == FUS_TOKEN_SPLIT){
        /* Since caller passes us each chunk directly,
        we should probably have a "split token buffer" in which we
        save current token, then append to it from the new chunk?.. */
        fprintf(stderr, "%s: TODO: Handle \"split\" tokens\n", __func__);
        fprintf(stderr, "...token was: %.*s\n",
            lexer->token_len, lexer->token);
        exit(EXIT_FAILURE);
    }
    lexer->chunk = chunk;
    lexer->chunk_size = chunk_size;
    lexer->chunk_i = 0;
}

void fus_lexer_next(fus_lexer_t *lexer){
}

bool fus_lexer_done(fus_lexer_t *lexer){
    return lexer->token_type == FUS_TOKEN_DONE;
}

bool fus_lexer_got(fus_lexer_t *lexer, const char *token){
    return lexer->token_len == strlen(token) &&
        strncmp(token, lexer->token, lexer->token_len);
}

