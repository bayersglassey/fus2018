#ifndef _FUS_LEXER_H_
#define _FUS_LEXER_H_

#include <stdlib.h>
#include <stdbool.h>


typedef struct fus_lexer {
    int dummy; /* C doesn't allow empty structs */
} fus_lexer_t;


void fus_lexer_init(fus_lexer_t *lexer);
void fus_lexer_cleanup(fus_lexer_t *lexer);
void fus_lexer_load_chunk(fus_lexer_t *lexer,
    const char *chunk, size_t chunk_len);
void fus_lexer_next(fus_lexer_t *lexer);
bool fus_lexer_done(fus_lexer_t *lexer);
bool fus_lexer_got(fus_lexer_t *lexer, const char *token);


#endif