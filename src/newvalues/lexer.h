#ifndef _FUS_LEXER_H_
#define _FUS_LEXER_H_

#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>
#include <ctype.h>


typedef enum fus_lexer_token_type {
    FUS_TOKEN_DONE,
    FUS_TOKEN_ERR,
    FUS_TOKEN_INT,
    FUS_TOKEN_SYM,
    FUS_TOKEN_STR,
    FUS_TOKEN_ARR_OPEN,
    FUS_TOKEN_ARR_CLOSE,
    FUS_TOKEN_SPLIT,
        /* A "split" token is one which touches end of chunk, so is
        probably "unfinished" and caller should load next chunk */
    FUS_TOKENS
} fus_lexer_token_type_t;

typedef struct fus_lexer {
    const char *chunk;
    size_t chunk_size;
    int chunk_i; /* position within chunk */

    char *filename;
    int pos; /* position within file */
    int row; /* row within file */
    int col; /* column within file */

    int indent;

    const char *token;
    int token_len;
    fus_lexer_token_type_t token_type;
} fus_lexer_t;


void fus_lexer_init(fus_lexer_t *lexer, char *filename);
void fus_lexer_reset(fus_lexer_t *lexer, char *filename);
void fus_lexer_cleanup(fus_lexer_t *lexer);
void fus_lexer_load_chunk(fus_lexer_t *lexer,
    const char *chunk, size_t chunk_size);

bool fus_lexer_done(fus_lexer_t *lexer);
bool fus_lexer_got(fus_lexer_t *lexer, const char *token);

void fus_lexer_next(fus_lexer_t *lexer);

#endif