#ifndef MYMAP_H
#define MYMAP_H
#include <QGraphicsItem>
#include <QPainter>

class Man : public QGraphicsItem
{
public:
    Man();
    QRectF boundingRect() const;
    void paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *);
    QPainterPath shape() const;
};

class Arena : public QGraphicsItem
{
public:
    Arena(qreal x,qreal y);
    QRectF boundingRect() const;
    void paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *);
    QPainterPath shape() const;
};

class Gym : public QGraphicsItem
{
public:
    Gym(qreal x,qreal y);
    QRectF boundingRect() const;
    void paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *);
    QPainterPath shape() const;
};

class Music : public QGraphicsItem
{
public:
    Music(qreal x,qreal y);
    QRectF boundingRect() const;
    void paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *);
    QPainterPath shape() const;
};

class Exit : public QGraphicsItem
{
public:
    Exit(qreal x,qreal y);
    QRectF boundingRect() const;
    void paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *);
    QPainterPath shape() const;
};

class leftPoke : public QGraphicsItem
{
public:
    leftPoke(int i);
    QRectF boundingRect() const;
    void paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *);
    QPainterPath shape() const;
private:
    int which;
};

class rightPoke : public QGraphicsItem
{
public:
    rightPoke(int i);
    QRectF boundingRect() const;
    void paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *);
    QPainterPath shape() const;
private:
    int which;
};

#endif // MYMAP_H
