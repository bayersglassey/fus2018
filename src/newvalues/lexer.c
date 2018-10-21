
#include "lexer.h"


void fus_lexer_init(fus_lexer_t *lexer){}
void fus_lexer_cleanup(fus_lexer_t *lexer){}
void fus_lexer_load_chunk(fus_lexer_t *lexer,
    const char *chunk, size_t chunk_len){}
void fus_lexer_next(fus_lexer_t *lexer){}
bool fus_lexer_done(fus_lexer_t *lexer){return true;}
bool fus_lexer_got(fus_lexer_t *lexer, const char *token){return false;}

