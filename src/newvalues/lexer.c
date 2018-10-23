
#include "lexer.h"

char *DEFAULT_FILENAME = "<no file>";

const char *fus_lexer_errcode_msg(fus_lexer_errcode_t errcode){
    static const char *msgs[] = {
        "OK",
        "Indentation with whitespace other than ' '",
        "Reached end of line in str literal",
        "Too many indents"
    };
    if(errcode < 0 || errcode >= FUS_LEXER_ERRCODES)return "Unknown";
    return msgs[errcode];
}


void fus_lexer_init(fus_lexer_t *lexer, char *filename){
    lexer->chunk = NULL;
    lexer->chunk_size = 0;
    lexer->chunk_i = 0;

    lexer->filename = filename? filename: DEFAULT_FILENAME;
    lexer->pos = 0;
    lexer->row = 0;
    lexer->col = 0;

    lexer->indent = 0;
    for(int i = 0; i < FUS_LEXER_MAX_INDENTS; i++)lexer->indents[i] = 0;
    lexer->n_indents = 0;
    lexer->returning_indents = 0;

    lexer->token = NULL;
    lexer->token_len = 0;
    lexer->token_type = FUS_TOKEN_ERROR;

    lexer->errcode = FUS_LEXER_ERRCODE_OK;
}

void fus_lexer_reset(fus_lexer_t *lexer, char *filename){
    fus_lexer_cleanup(lexer);
    fus_lexer_init(lexer, filename);
}

void fus_lexer_cleanup(fus_lexer_t *lexer){
    if(lexer->filename != DEFAULT_FILENAME)free(lexer->filename);
}

void fus_lexer_set_error(fus_lexer_t *lexer, fus_lexer_errcode_t errcode){
    /* NOTE: We preserve token and token_len, so that e.g. error messages
    can find start of token.
    But some kinds of errors can probably occur before we've started a
    token.
    So maybe we need 2 different set_error functions?..
    One of which sets token=NULL, token_len=0?.. */
    lexer->token_type = FUS_TOKEN_ERROR;
    lexer->errcode = errcode;
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

bool fus_lexer_done(fus_lexer_t *lexer){
    return lexer->token_type == FUS_TOKEN_DONE;
}

bool fus_lexer_got(fus_lexer_t *lexer, const char *token){
    return lexer->token_len == strlen(token) &&
        strncmp(token, lexer->token, lexer->token_len);
}



/*************
 * DEBUGGING *
 *************/

#define FUS_LEXER_INFO(LEXER, F) { \
    fus_lexer_t *__lexer = (LEXER); \
    fprintf((F), "%s: row %i: col %i: ", \
        __lexer->filename, \
        __lexer->row + 1, \
        __lexer->col - __lexer->token_len + 1); \
}

#define FUS_LEXER_ERROR(LEXER) \
    fprintf(stderr, "%s: LEXER ERROR: ", __func__); \
    FUS_LEXER_INFO(LEXER, stderr)

static void fus_lexer_perror(fus_lexer_t *lexer){
    FUS_LEXER_ERROR(lexer)
    fprintf(stderr, "%s\n", fus_lexer_errcode_msg(lexer->errcode));
}


/************************
 * LET THE LEXING BEGIN *
 ************************/

static void fus_lexer_start_token(fus_lexer_t *lexer){
    lexer->token = lexer->chunk + lexer->chunk_i;
    lexer->token_len = 0;
}

static void fus_lexer_end_token(fus_lexer_t *lexer){
    int token_startpos = lexer->token - lexer->chunk;
    lexer->token_len = lexer->chunk_i - token_startpos;
}

static void fus_lexer_set_token(fus_lexer_t *lexer,
    const char *token, int token_len
){
    lexer->token = token;
    lexer->token_len = token_len;
}

static char fus_lexer_peek(fus_lexer_t *lexer){
    /* Peek at next character. Only ever called after encountering
    '-' (when we need to determine whether we're lexing a negative number
    or an op) or ';' (when we need to determine whether we're lexing a
    string-till-end-of-line or an op). */
    if(lexer->chunk_i + 1 >= lexer->chunk_size)return '\0';
    return lexer->chunk[lexer->chunk_i + 1];
}

static char fus_lexer_eat(fus_lexer_t *lexer){
    /* Move lexer forward by 1 character.
    This should be the only way to do so.
    That way, we can be reasonably certain that
    pos, row, col are correct. */

    char c = lexer->chunk[lexer->chunk_i];
    lexer->chunk_i++;
    lexer->pos++;
    if(c == '\n'){
        lexer->row++;
        lexer->col = 0;
    }else{
        lexer->col++;
    }
    return c;
}

static int fus_lexer_eat_indent(fus_lexer_t *lexer){
    /* Eats the whitespace starting at beginning of a line,
    updating lexer->indent in the process.
    Returns lexer->indent, or -1 on failure. */
    int indent = 0;
    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == ' '){
            indent++;
            fus_lexer_eat(lexer);
        }else if(c == '\n'){
            /* blank lines don't count towards indentation --
            just reset the indentation and restart on next line */
            indent = 0;
            fus_lexer_eat(lexer);
        }else if(c != '\0' && isspace(c)){
            fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_BAD_INDENT_CHAR);
            return -1;
        }else{
            break;
        }
    }
    lexer->indent = indent;
    return indent;
}

static void fus_lexer_eat_whitespace(fus_lexer_t *lexer){
    /* Eats the whitespace *not* at the start of a line
    (e.g. between tokens on the same line) */
    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == '\0' || isgraph(c))break;
        fus_lexer_eat(lexer);
    }
}

static void fus_lexer_eat_comment(fus_lexer_t *lexer){
    /* eat leading '#' */
    fus_lexer_eat(lexer);

    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == '\n')break;
        fus_lexer_eat(lexer);
    }
}

static void fus_lexer_parse_sym(fus_lexer_t *lexer){
    fus_lexer_start_token(lexer);
    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c != '_' && !isalnum(c))break;
        fus_lexer_eat(lexer);
    }
    fus_lexer_end_token(lexer);
}

static void fus_lexer_parse_int(fus_lexer_t *lexer){
    fus_lexer_start_token(lexer);

    /* eat leading '-' if present */
    if(lexer->chunk[lexer->chunk_i] == '-')fus_lexer_eat(lexer);

    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(!isdigit(c))break;
        fus_lexer_eat(lexer);
    }
    fus_lexer_end_token(lexer);
}

static void fus_lexer_parse_op(fus_lexer_t *lexer){
    fus_lexer_start_token(lexer);
    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == '(' || c == ')' || c == ':' || c == '_'
            || !isgraph(c) || isalnum(c))break;
        fus_lexer_eat(lexer);
    }
    fus_lexer_end_token(lexer);
}

static int fus_lexer_parse_str(fus_lexer_t *lexer){
    fus_lexer_start_token(lexer);

    /* Include leading '"' */
    fus_lexer_eat(lexer);

    while(1){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == '\0'){
            goto err_eof;
        }else if(c == '\n'){
            goto err_eol;
        }else if(c == '"'){
            fus_lexer_eat(lexer);
            break;
        }else if(c == '\\'){
            fus_lexer_eat(lexer);
            char c = lexer->chunk[lexer->chunk_i];
            if(c == '\0'){
                goto err_eof;
            }else if(c == '\n'){
                goto err_eol;
            }
        }
        fus_lexer_eat(lexer);
    }
    fus_lexer_end_token(lexer);
    return 0;
err_eol:
err_eof:
    fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_STR_UNFINISHED);
    return -1;
}

static void fus_lexer_parse_blockstr(fus_lexer_t *lexer){
    fus_lexer_start_token(lexer);

    /* Include leading ";;" */
    fus_lexer_eat(lexer);
    fus_lexer_eat(lexer);

    while(lexer->chunk_i < lexer->chunk_size){
        char c = lexer->chunk[lexer->chunk_i];
        if(c == '\0'){
            break;
        }else if(c == '\n'){
            break;
        }
        fus_lexer_eat(lexer);
    }
    fus_lexer_end_token(lexer);
}

static int fus_lexer_push_indent(fus_lexer_t *lexer, int indent){
    return 0;
}

static int fus_lexer_pop_indent(fus_lexer_t *lexer){
    return 0;
}

static int fus_lexer_finish_line(fus_lexer_t *lexer){
    /* Finish end of line / end of file.
    Handles the end of indented blocks. */

    if(fus_lexer_eat_indent(lexer) < 0)return -1;
    int new_indent = lexer->indent;
    while(lexer->n_indents > 0){
        int indent = lexer->indents[lexer->n_indents-1];
        if(new_indent <= indent){
            if(fus_lexer_pop_indent(lexer) < 0)return -1;

            /* Indentation is down past indent of last indented block,
            so emit a fake ")" */
            lexer->returning_indents--;

        }else break;
    }
    return 0;
}

void fus_lexer_next(fus_lexer_t *lexer){
    char c = '\0';

    /* Eat various kinds of whitespace */
    while(lexer->chunk_i < lexer->chunk_size){

        /* Get next character */
        c = lexer->chunk[lexer->chunk_i];

        if(c == '\n' || c == '\0'){
            /* Finish end of line / end of file */
            if(c == '\n')fus_lexer_eat(lexer);
            if(fus_lexer_finish_line(lexer) < 0)return;
            if(c == '\0')break;
        }else if(isspace(c)){
            /* Eat whitespace */
            fus_lexer_eat_whitespace(lexer);
        }else if(c == '#'){
            /* Eat comment */
            fus_lexer_eat_comment(lexer);
        }else if(c == ':'){
            /* Start new indented block */
            fus_lexer_eat(lexer);
            lexer->returning_indents++;
            if(fus_lexer_push_indent(lexer, lexer->indent) < 0)return;
        }else break;
    }

    if(c == '(' || c == ')'){
        fus_lexer_start_token(lexer);
        fus_lexer_eat(lexer);
        fus_lexer_end_token(lexer);
        lexer->token_type = c == '('? FUS_TOKEN_ARR_OPEN: FUS_TOKEN_ARR_CLOSE;
    }else if(c == '_' || isalpha(c)){
        fus_lexer_parse_sym(lexer);
        lexer->token_type = FUS_TOKEN_SYM;
    }else if(isdigit(c) || (
        c == '-' && isdigit(fus_lexer_peek(lexer))
    )){
        fus_lexer_parse_int(lexer);
        lexer->token_type = FUS_TOKEN_INT;
    }else if(c == '"'){
        if(fus_lexer_parse_str(lexer) < 0)return;
        lexer->token_type = FUS_TOKEN_STR;
    }else if(c == ';' && fus_lexer_peek(lexer) == ';'){
        fus_lexer_parse_blockstr(lexer);
        lexer->token_type = FUS_TOKEN_STR;
    }else{
        fus_lexer_parse_op(lexer);
        lexer->token_type = FUS_TOKEN_SYM;
    }

    /* At the VERY END of fus_lexer_next, we should check lexer->chunk_i
    against lexer->chunk_size and decide whether current token is a split
    token.
    This could even affect token's type, e.g. we thought we got "-" but
    the next chunk will start with "123" so type is int even though we
    thought it was op. */
}
