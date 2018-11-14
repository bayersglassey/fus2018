#ifndef _FUS_LEXER_H_
#define _FUS_LEXER_H_

#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>
#include <ctype.h>


typedef enum fus_lexer_token_type {
    FUS_TOKEN_DONE,
    FUS_TOKEN_ERROR,
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

const char *fus_lexer_token_type_msg(fus_lexer_token_type_t type);

typedef enum fus_lexer_errcode {
    FUS_LEXER_ERRCODE_OK,
    FUS_LEXER_ERRCODE_BAD_INDENT_CHAR,
    FUS_LEXER_ERRCODE_STR_UNFINISHED,
    FUS_LEXER_ERRCODE_TOO_MANY_INDENTS,
    FUS_LEXER_ERRCODE_TOO_FEW_INDENTS,
    FUS_LEXER_ERRCODE_NEGATIVE_INDENT,
    FUS_LEXER_ERRCODE_IDUNNO,
    FUS_LEXER_ERRCODES
} fus_lexer_errcode_t;

const char *fus_lexer_errcode_msg(fus_lexer_errcode_t errcode);

#define FUS_LEXER_MAX_INDENTS 64

typedef struct fus_lexer {
    const char *chunk;
    size_t chunk_size;
    int chunk_i; /* position within chunk */
    bool chunk_is_final;
        /* end of chunk is end of file, even if no terminating NUL */

    char *filename;
    int pos; /* position within file */
    int row; /* row within file */
    int col; /* column within file */

    int indent;
    int indents[FUS_LEXER_MAX_INDENTS];
    int n_indents;
    int returning_indents;

    const char *token;
    int token_len;
    fus_lexer_token_type_t token_type;

    fus_lexer_errcode_t errcode;
} fus_lexer_t;


void fus_lexer_init(fus_lexer_t *lexer, char *filename);
void fus_lexer_reset(fus_lexer_t *lexer, char *filename);
void fus_lexer_cleanup(fus_lexer_t *lexer);
void fus_lexer_set_error(fus_lexer_t *lexer, fus_lexer_errcode_t errcode);
void fus_lexer_load_chunk(fus_lexer_t *lexer,
    const char *chunk, size_t chunk_size);
void fus_lexer_mark_final(fus_lexer_t *lexer);

bool fus_lexer_is_ok(fus_lexer_t *lexer);
bool fus_lexer_is_done(fus_lexer_t *lexer);
bool fus_lexer_is_split(fus_lexer_t *lexer);
bool fus_lexer_is_error(fus_lexer_t *lexer);
bool fus_lexer_got(fus_lexer_t *lexer, const char *token);

void fus_lexer_print_token(fus_lexer_t *lexer, FILE *file, bool print_type);
void fus_lexer_pinfo(fus_lexer_t *lexer, FILE *file);
void fus_lexer_perror(fus_lexer_t *lexer, const char *msg);

void fus_lexer_next(fus_lexer_t *lexer);

#endif